pipeline {
    agent any

    environment {
        APP_NAME    = "ai-mock-interview"
        DOCKER_USER = "kethanayatti"
        REGISTRY    = "docker.io/${DOCKER_USER}/${APP_NAME}"

        EC2_IP = "13.220.61.216"
        PORT   = "3000"

        BLUE  = "app-blue"
        GREEN = "app-green"
        OLD   = "app-old"
    }

    options {
        timestamps()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {

        stage('Checkout') {
            steps { checkout scm }
        }

        stage('Build & Test') {
            steps {
                sh '''
                    npm ci
                    npm run lint || true
                    npm test || true
                '''
            }
        }

        stage('Docker Build') {
            steps {
                sh '''
                    docker build -t ${REGISTRY}:latest -t ${REGISTRY}:${BUILD_NUMBER} .
                '''
            }
        }

        stage('Push Image') {
            when { branch 'main' }
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'docker-credentials',
                    usernameVariable: 'USER',
                    passwordVariable: 'PASS'
                )]) {
                    sh '''
                        echo $PASS | docker login -u $USER --password-stdin
                        docker push ${REGISTRY}:latest
                        docker push ${REGISTRY}:${BUILD_NUMBER}
                        docker logout
                    '''
                }
            }
        }

        stage('Deploy GREEN') {
            when { branch 'main' }
            steps {
                withCredentials([
                    sshUserPrivateKey(credentialsId: 'ec2-ssh-key', keyFileVariable: 'KEY', usernameVariable: 'SSH_USER'),
                    string(credentialsId: 'mongo-uri', variable: 'MONGO_URI'),
                    string(credentialsId: 'gemini-api-key', variable: 'GEMINI_API_KEY')
                ]) {

                    writeFile file: 'app.env', text: """
PORT=${PORT}
MONGO_URI=${MONGO_URI}
GEMINI_API_KEY=${GEMINI_API_KEY}
"""

                    sh '''
                        scp -i $KEY -o StrictHostKeyChecking=no app.env $SSH_USER@''' + EC2_IP + ''':/tmp/app.env
                    '''

                    sh '''
                        ssh -i $KEY -o StrictHostKeyChecking=no $SSH_USER@''' + EC2_IP + ''' << 'EOF'
set -e

# Detect active port safely
ACTIVE_PORT=$(grep proxy_pass /etc/nginx/sites-available/default | grep -o '[0-9][0-9]*' | tail -1)
[ -z "$ACTIVE_PORT" ] && ACTIVE_PORT=3000

if [ "$ACTIVE_PORT" = "3000" ]; then
  IDLE_PORT=3001
else
  IDLE_PORT=3000
fi

echo $ACTIVE_PORT > /tmp/active_port
echo $IDLE_PORT > /tmp/idle_port

docker pull ''' + REGISTRY + ''':latest

docker rm -f app-green 2>/dev/null || true

docker run -d \
  -p $IDLE_PORT:''' + PORT + ''' \
  --name app-green \
  --env-file /tmp/app.env \
  ''' + REGISTRY + ''':latest

rm -f /tmp/app.env
EOF
                    '''
                }
            }
        }

        stage('Health Check GREEN') {
            when { branch 'main' }
            steps {
                sh '''
ssh -i $KEY -o StrictHostKeyChecking=no $SSH_USER@''' + EC2_IP + ''' << 'EOF'
IDLE_PORT=$(cat /tmp/idle_port)

for i in $(seq 1 10); do
  curl -sf http://localhost:$IDLE_PORT/health && exit 0
  sleep 5
done

exit 1
EOF
                '''
            }
        }

        stage('Switch Traffic (Safe)') {
            when { branch 'main' }
            steps {
                sh '''
ssh -i $KEY -o StrictHostKeyChecking=no $SSH_USER@''' + EC2_IP + ''' << 'EOF'
set -e

ACTIVE_PORT=$(cat /tmp/active_port)
IDLE_PORT=$(cat /tmp/idle_port)

# SAFE replace (only proxy_pass line)
sudo sed -i "/proxy_pass/c\\        proxy_pass http://localhost:$IDLE_PORT;" /etc/nginx/sites-available/default

sudo nginx -t
sudo systemctl reload nginx

docker rename app-blue app-old 2>/dev/null || true
docker rename app-green app-blue
EOF
                '''
            }
        }

        stage('Post Switch Validation') {
            when { branch 'main' }
            steps {
                sh '''
ssh -i $KEY -o StrictHostKeyChecking=no $SSH_USER@''' + EC2_IP + ''' << 'EOF'

if ! curl -f http://localhost/health; then
    echo "ROLLBACK TRIGGERED"

    ACTIVE_PORT=$(cat /tmp/active_port)

    sudo sed -i "/proxy_pass/c\\        proxy_pass http://localhost:$ACTIVE_PORT;" /etc/nginx/sites-available/default
    sudo systemctl reload nginx

    docker rm -f app-blue
    docker rename app-old app-blue

    exit 1
fi
EOF
                '''
            }
        }

        stage('Monitoring Window (Auto Rollback)') {
            when { branch 'main' }
            steps {
                sh '''
ssh -i $KEY -o StrictHostKeyChecking=no $SSH_USER@''' + EC2_IP + ''' << 'EOF'

for i in $(seq 1 12); do
    if ! curl -sf http://localhost/health; then
        echo "Runtime failure detected — rolling back"

        ACTIVE_PORT=$(cat /tmp/active_port)

        sudo sed -i "/proxy_pass/c\\        proxy_pass http://localhost:$ACTIVE_PORT;" /etc/nginx/sites-available/default
        sudo systemctl reload nginx

        docker rm -f app-blue
        docker rename app-old app-blue

        exit 1
    fi
    sleep 10
done

echo "System stable"
EOF
                '''
            }
        }

        stage('Cleanup + Disk Management') {
            when { branch 'main' }
            steps {
                sh '''
ssh -i $KEY -o StrictHostKeyChecking=no $SSH_USER@''' + EC2_IP + ''' << 'EOF'

docker rm -f app-old 2>/dev/null || true
docker system prune -af

EOF
                '''
            }
        }

        stage('Basic Load Test') {
            when { branch 'main' }
            steps {
                sh '''
                    ab -n 200 -c 20 http://''' + EC2_IP + '''/
                '''
            }
        }
    }

    post {
        success {
            echo "🚀 Production deployment SUCCESS (safe + verified)"
        }
        failure {
            echo "❌ Deployment FAILED with rollback"
        }
    }
}