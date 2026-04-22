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
    }

    options {
        timestamps()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Verify Environment') {
            steps {
                sh '''
                    echo "Node Version:"   && node -v
                    echo "NPM Version:"    && npm -v
                    echo "Docker Version:" && docker --version
                '''
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Lint') {
            steps {
                sh 'npm run lint'
            }
        }

        stage('Test') {
            steps {
                sh 'npm test'
            }
        }

        stage('Security Audit') {
            steps {
                catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
                    sh 'npm audit --audit-level=moderate'
                }
            }
        }

        stage('Build Docker Image') {
            steps {

                sh """
                    docker build -t ${REGISTRY}:latest -t ${REGISTRY}:${BUILD_NUMBER} .
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
                        echo $DOCKER_LOGIN_PASS | docker login -u $DOCKER_LOGIN_USER --password-stdin
                    ''' + "\n" + """
                        docker push ${REGISTRY}:latest
                        docker push ${REGISTRY}:${BUILD_NUMBER}
                    """ + '''
                        docker logout
                    '''
                }
            }
        }

        stage('Deploy GREEN') {
            when { branch 'main' }
            steps {
                withCredentials([
                    sshUserPrivateKey(credentialsId: 'ec2-ssh-key',   keyFileVariable: 'KEY', usernameVariable: 'SSH_USER'),
                    string(credentialsId: 'node-env',         variable: 'NODE_ENV'),
                    string(credentialsId: 'jwt-secret',       variable: 'JWT_SECRET'),
                    string(credentialsId: 'session-secret',   variable: 'SESSION_SECRET'),
                    string(credentialsId: 'mongo-uri',        variable: 'MONGO_URI'),
                    string(credentialsId: 'gmail-user',       variable: 'GMAIL_USER'),
                    string(credentialsId: 'gmail-pass',       variable: 'GMAIL_PASS'),
                    string(credentialsId: 'gemini-api-key',   variable: 'GEMINI_API_KEY'),
                    string(credentialsId: 'openai-api-key',   variable: 'OPENAI_API_KEY'),
                    string(credentialsId: 'cohere-api-key',   variable: 'COHERE_API_KEY'),
                    string(credentialsId: 'cohere-api-key-2', variable: 'COHERE_API_KEY_2')
                ]) {
                    script {

                        writeFile file: 'app.env', text: """\
PORT=${PORT}
NODE_ENV=${NODE_ENV}
JWT_SECRET=${JWT_SECRET}
SESSION_SECRET=${SESSION_SECRET}
MONGO_URI=${MONGO_URI}
GMAIL_USER=${GMAIL_USER}
GMAIL_PASS=${GMAIL_PASS}
GEMINI_API_KEY=${GEMINI_API_KEY}
OPENAI_API_KEY=${OPENAI_API_KEY}
COHERE_API_KEY=${COHERE_API_KEY}
COHERE_API_KEY_2=${COHERE_API_KEY_2}
"""
                    }

                    sh '''
                        scp -i $KEY -o StrictHostKeyChecking=no \
                            app.env $SSH_USER@''' + EC2_IP + ''':/tmp/app.env
                    '''

                    sh '''
                        ssh -i $KEY -o StrictHostKeyChecking=no $SSH_USER@''' + EC2_IP + ''' << 'ENDSSH'
set -e

ACTIVE_PORT=$(cat /etc/nginx/sites-available/default | grep proxy_pass | grep -o '[0-9]\+' | tail -1)

if [ -z "$ACTIVE_PORT" ]; then
  ACTIVE_PORT=3000
fi

if [ "$ACTIVE_PORT" = "3000" ]; then
  IDLE_PORT=3001
else
  IDLE_PORT=3000
fi

echo "ACTIVE_PORT=$ACTIVE_PORT"
echo "IDLE_PORT=$IDLE_PORT"

echo "$ACTIVE_PORT" > /tmp/active_port
echo "$IDLE_PORT"   > /tmp/idle_port
echo "BLUE is on $ACTIVE_PORT — deploying GREEN to $IDLE_PORT"

docker pull ''' + REGISTRY + ''':latest

docker stop  app-green 2>/dev/null || true
docker rm    app-green 2>/dev/null || true

docker run -d \
  -p "$IDLE_PORT":''' + PORT + ''' \
  --name app-green \
  --env-file /tmp/app.env \
  ''' + REGISTRY + ''':latest

# Remove env file from EC2 immediately — no secrets left on disk
rm -f /tmp/app.env

echo "GREEN started on port $IDLE_PORT"
ENDSSH
                    '''
                }
            }
        }

        stage('Health Check (GREEN)') {
            when { branch 'main' }
            steps {
                withCredentials([sshUserPrivateKey(
                    credentialsId: 'ec2-ssh-key',
                    keyFileVariable: 'KEY',
                    usernameVariable: 'SSH_USER'
                )]) {
                    sh '''
                        ssh -i $KEY -o StrictHostKeyChecking=no $SSH_USER@''' + EC2_IP + ''' << 'ENDSSH'
IDLE_PORT=$(cat /tmp/idle_port)
echo "Health-checking GREEN on port $IDLE_PORT ..."
for i in $(seq 1 12); do
    if curl -sf http://localhost:$IDLE_PORT/health; then
        echo "Health check passed on attempt $i"
        exit 0
    fi
    echo "Attempt $i/12 failed — waiting 5s..."
    sleep 5
done
echo "ERROR: health check failed after 12 attempts (60s)"
exit 1
ENDSSH
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
                        ssh -i $KEY -o StrictHostKeyChecking=no $SSH_USER@''' + EC2_IP + ''' << 'ENDSSH'
set -e
ACTIVE_PORT=$(cat /tmp/active_port)
IDLE_PORT=$(cat /tmp/idle_port)

echo "Switching nginx proxy: $ACTIVE_PORT -> $IDLE_PORT"
sudo sed -i "s/$ACTIVE_PORT/$IDLE_PORT/g" /etc/nginx/sites-available/default
sudo nginx -t
sudo systemctl reload nginx

docker stop  app-blue 2>/dev/null || true
docker rm    app-blue 2>/dev/null || true
docker rename app-green app-blue

echo "Done — live traffic now on port $IDLE_PORT (container: app-blue)"
ENDSSH
                    '''
                }
            }
        }
    }

    post {
        success {
            echo "✅ SUCCESS: ${BRANCH_NAME} build #${BUILD_NUMBER} deployed"
        }

        failure {
            echo "❌ FAILED: ${BRANCH_NAME} build #${BUILD_NUMBER}"
            script {
                sh 'rm -f app.env || true'

                if (env.BRANCH_NAME == 'main') {
                    withCredentials([sshUserPrivateKey(
                        credentialsId: 'ec2-ssh-key',
                        keyFileVariable: 'KEY',
                        usernameVariable: 'SSH_USER'
                    )]) {
                        sh '''
                            ssh -i $KEY -o StrictHostKeyChecking=no $SSH_USER@''' + EC2_IP + ''' << 'ENDSSH'
echo "=== Rollback triggered ==="

rm -f /tmp/app.env

ACTIVE_PORT=$(cat /tmp/active_port 2>/dev/null || echo "3000")
IDLE_PORT=$(cat /tmp/idle_port 2>/dev/null || echo "3001")

# Revert nginx to the previously live port
sudo sed -i "s/$IDLE_PORT/$ACTIVE_PORT/g" /etc/nginx/sites-available/default
sudo nginx -t
sudo systemctl reload nginx

# Remove the broken GREEN container
docker stop app-green 2>/dev/null || true
docker rm   app-green 2>/dev/null || true

echo "Rollback complete — traffic restored to port $ACTIVE_PORT (app-blue is live)"
ENDSSH
                        '''
                    }
                }
            }
        }

        always {
            sh 'rm -f app.env || true'
            cleanWs()
        }
    }
}