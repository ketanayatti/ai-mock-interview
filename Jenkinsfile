pipeline {
    agent any

    environment {
        APP_NAME    = "ai-mock-interview"
        DOCKER_USER = "kethanayatti"
        REGISTRY    = "docker.io/kethanayatti/ai-mock-interview"
        EC2_IP      = "13.220.61.216"
        APP_PORT    = "3000"
    }

    options {
        timestamps()
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')   // overall pipeline timeout
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build & Test') {
            steps {
                sh '''
                    npm ci
                    npm run lint
                    npm test
                '''
            }
        }

        stage('Docker Build') {
            steps {
                sh """
                    docker build \
                        -t ${REGISTRY}:latest \
                        -t ${REGISTRY}:${BUILD_NUMBER} \
                        .
                """
            }
        }

        stage('Push Image') {
            when { branch 'main' }
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'docker-credentials',
                    usernameVariable: 'DOCKER_LOGIN_USER',
                    passwordVariable: 'DOCKER_LOGIN_PASS'
                )]) {
                    sh '''
                        echo "$DOCKER_LOGIN_PASS" | docker login -u "$DOCKER_LOGIN_USER" --password-stdin
                        docker push "$REGISTRY":latest
                        docker push "$REGISTRY":"$BUILD_NUMBER"
                        docker logout
                    '''
                }
            }
        }

        stage('Deploy GREEN') {
            when { branch 'main' }
            steps {
                withCredentials([
                    sshUserPrivateKey(
                        credentialsId: 'ec2-ssh-key',
                        keyFileVariable: 'KEY',
                        usernameVariable: 'SSH_USER'
                    ),
                    string(credentialsId: 'mongo-uri',       variable: 'MONGO_URI'),
                    string(credentialsId: 'gemini-api-key',  variable: 'GEMINI_API_KEY')
                ]) {
                  
                    sh '''
                        printf 'PORT=%s\nMONGO_URI=%s\nGEMINI_API_KEY=%s\n' \
                            "$APP_PORT" "$MONGO_URI" "$GEMINI_API_KEY" > app.env
                    '''

                    sh '''
                        scp -i "$KEY" -o StrictHostKeyChecking=no \
                            app.env "$SSH_USER"@"$EC2_IP":/tmp/app.env
                        rm -f app.env
                    '''

                    sh '''
                        ssh -i "$KEY" -o StrictHostKeyChecking=no "$SSH_USER"@"$EC2_IP" bash -s << 'REMOTE'
set -e

# ── Detect which port is currently active ──────────────────────
ACTIVE_PORT=$(grep -oP 'proxy_pass http://localhost:\\K[0-9]+' \
              /etc/nginx/sites-available/default 2>/dev/null || echo "3000")
[ -z "$ACTIVE_PORT" ] && ACTIVE_PORT=3000

if [ "$ACTIVE_PORT" = "3000" ]; then
    IDLE_PORT=3001
else
    IDLE_PORT=3000
fi

echo "$ACTIVE_PORT" > /tmp/active_port
echo "$IDLE_PORT"   > /tmp/idle_port

echo "Active: $ACTIVE_PORT  →  Deploying to idle: $IDLE_PORT"

# ── Pull latest image ───────────────────────────────────────────
docker pull kethanayatti/ai-mock-interview:latest

# ── Stop old green container if present ────────────────────────
docker rm -f app-green 2>/dev/null || true

# ── Start new green container on idle port ─────────────────────
docker run -d \
    -p "$IDLE_PORT":3000 \
    --name app-green \
    --restart unless-stopped \
    --env-file /tmp/app.env \
    kethanayatti/ai-mock-interview:latest

rm -f /tmp/app.env
echo "app-green started on port $IDLE_PORT"
REMOTE
                    '''
                }
            }
        }

        stage('Health Check GREEN') {
            when { branch 'main' }
            options { timeout(time: 2, unit: 'MINUTES') }
            steps {
                withCredentials([sshUserPrivateKey(
                    credentialsId: 'ec2-ssh-key',
                    keyFileVariable: 'KEY',
                    usernameVariable: 'SSH_USER'
                )]) {
                    sh '''
                        ssh -i "$KEY" -o StrictHostKeyChecking=no "$SSH_USER"@"$EC2_IP" bash -s << 'REMOTE'
set -e
IDLE_PORT=$(cat /tmp/idle_port)
echo "Health-checking http://localhost:$IDLE_PORT/health ..."

for i in $(seq 1 12); do
    if curl -sf "http://localhost:$IDLE_PORT/health"; then
        echo "Health check passed on attempt $i"
        exit 0
    fi
    echo "Attempt $i/12 failed — retrying in 5s..."
    sleep 5
done

echo "Health check FAILED after 12 attempts"
exit 1
REMOTE
                    '''
                }
            }
        }

        stage('Switch Traffic') {
            when { branch 'main' }
            steps {
                withCredentials([sshUserPrivateKey(
                    credentialsId: 'ec2-ssh-key',
                    keyFileVariable: 'KEY',
                    usernameVariable: 'SSH_USER'
                )]) {
                    sh '''
                        ssh -i "$KEY" -o StrictHostKeyChecking=no "$SSH_USER"@"$EC2_IP" bash -s << 'REMOTE'
set -e
IDLE_PORT=$(cat /tmp/idle_port)

# Atomic swap of nginx proxy_pass
sudo sed -i "s|proxy_pass http://localhost:[0-9]*;|proxy_pass http://localhost:$IDLE_PORT;|" \
    /etc/nginx/sites-available/default

sudo nginx -t
sudo systemctl reload nginx

# Rotate container names: blue → old, green → blue
docker rename app-blue app-old 2>/dev/null || true
docker rename app-green app-blue

echo "Traffic switched to port $IDLE_PORT"
REMOTE
                    '''
                }
            }
        }

        stage('Post Switch Validation') {
            when { branch 'main' }
            steps {
                withCredentials([sshUserPrivateKey(
                    credentialsId: 'ec2-ssh-key',
                    keyFileVariable: 'KEY',
                    usernameVariable: 'SSH_USER'
                )]) {
                    sh '''
                        ssh -i "$KEY" -o StrictHostKeyChecking=no "$SSH_USER"@"$EC2_IP" bash -s << 'REMOTE'
set -e

if ! curl -sf http://localhost/health; then
    echo "Post-switch validation FAILED — rolling back"

    ACTIVE_PORT=$(cat /tmp/active_port)
    sudo sed -i "s|proxy_pass http://localhost:[0-9]*;|proxy_pass http://localhost:$ACTIVE_PORT;|" \
        /etc/nginx/sites-available/default
    sudo systemctl reload nginx

    docker rm -f app-blue  2>/dev/null || true
    docker rename app-old app-blue 2>/dev/null || true

    exit 1
fi

echo "Post-switch validation passed"
REMOTE
                    '''
                }
            }
        }

        stage('Monitoring Window') {
            when { branch 'main' }
            options { timeout(time: 5, unit: 'MINUTES') }
            steps {
                withCredentials([sshUserPrivateKey(
                    credentialsId: 'ec2-ssh-key',
                    keyFileVariable: 'KEY',
                    usernameVariable: 'SSH_USER'
                )]) {
                    sh '''
                        ssh -i "$KEY" -o StrictHostKeyChecking=no "$SSH_USER"@"$EC2_IP" bash -s << 'REMOTE'
set -e

echo "Monitoring /health for 2 minutes..."
for i in $(seq 1 12); do
    if ! curl -sf http://localhost/health; then
        echo "Runtime failure on check $i — rolling back"

        ACTIVE_PORT=$(cat /tmp/active_port)
        sudo sed -i "s|proxy_pass http://localhost:[0-9]*;|proxy_pass http://localhost:$ACTIVE_PORT;|" \
            /etc/nginx/sites-available/default
        sudo systemctl reload nginx

        docker rm -f app-blue  2>/dev/null || true
        docker rename app-old app-blue 2>/dev/null || true

        exit 1
    fi
    echo "Check $i/12 OK"
    sleep 10
done

echo "System stable — monitoring window complete"
REMOTE
                    '''
                }
            }
        }

        stage('Cleanup') {
            when { branch 'main' }
            steps {
                withCredentials([sshUserPrivateKey(
                    credentialsId: 'ec2-ssh-key',
                    keyFileVariable: 'KEY',
                    usernameVariable: 'SSH_USER'
                )]) {
                    sh '''
                        ssh -i "$KEY" -o StrictHostKeyChecking=no "$SSH_USER"@"$EC2_IP" bash -s << 'REMOTE'

docker rm -f app-old 2>/dev/null || true
docker image prune -f
docker container prune -f

echo "Disk usage after cleanup:"
df -h /
REMOTE
                    '''
                }
            }
        }

        stage('Load Test') {
            when { branch 'main' }
            steps {
                sh "ab -n 200 -c 20 http://${EC2_IP}/"
            }
        }

    } 

    post {
        success {
            echo "🚀 Deployment SUCCESS — build #${BUILD_NUMBER} is live"
        }
        failure {
            echo "❌ Deployment FAILED — check logs above for details"
        }
        always {
            sh 'rm -f app.env || true' 
            cleanWs()
        }
    }
}