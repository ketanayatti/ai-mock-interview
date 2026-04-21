pipeline {
    agent any

    environment {
        APP_NAME = "ai-mock-interview"
        DOCKER_USER = "kethanayatti"
        REGISTRY = "docker.io/${DOCKER_USER}/${APP_NAME}"

        EC2_IP = "13.220.61.216"
        PORT = "3000"

        BLUE = "app-blue"
        GREEN = "app-green"

        ACTIVE_PORT = "3000"
        IDLE_PORT = "3001"
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
                echo "Node Version:"
                node -v
                echo "NPM Version:"
                npm -v
                echo "Docker Version:"
                docker --version
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
                sh '''
                docker build -t ${REGISTRY}:latest .
                docker build -t ${REGISTRY}:${BUILD_NUMBER} .
                '''
            }
        }

        stage('Push Image') {
            when { branch 'main' }
            steps {
                withCredentials([usernamePassword(credentialsId: 'docker-credentials', usernameVariable: 'USER', passwordVariable: 'PASS')]) {
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
                withCredentials([sshUserPrivateKey(credentialsId: 'ec2-ssh-key', keyFileVariable: 'KEY', usernameVariable: 'USER')]) {
                    sh '''
                    ssh -i $KEY -o StrictHostKeyChecking=no $USER@${EC2_IP} << EOF
docker pull ${REGISTRY}:latest
docker stop ${GREEN} 2>/dev/null || true
docker rm ${GREEN} 2>/dev/null || true
docker run -d -p ${IDLE_PORT}:${PORT} --name ${GREEN} ${REGISTRY}:latest
EOF
                    '''
                }
            }
        }

        stage('Health Check (GREEN)') {
            when { branch 'main' }
            steps {
                withCredentials([sshUserPrivateKey(credentialsId: 'ec2-ssh-key', keyFileVariable: 'KEY', usernameVariable: 'USER')]) {
                    sh '''
                    ssh -i $KEY -o StrictHostKeyChecking=no $USER@${EC2_IP} << EOF
for i in {1..5}; do
  curl -f http://localhost:${IDLE_PORT}/health && exit 0
  sleep 3
done
exit 1
EOF
                    '''
                }
            }
        }

        stage('Switch Traffic') {
            when { branch 'main' }
            steps {
                withCredentials([sshUserPrivateKey(credentialsId: 'ec2-ssh-key', keyFileVariable: 'KEY', usernameVariable: 'USER')]) {
                    sh '''
                    ssh -i $KEY -o StrictHostKeyChecking=no $USER@${EC2_IP} << EOF
sudo sed -i 's/${ACTIVE_PORT}/${IDLE_PORT}/g' /etc/nginx/sites-available/default
sudo systemctl reload nginx
docker stop ${BLUE} 2>/dev/null || true
docker rm ${BLUE} 2>/dev/null || true
docker rename ${GREEN} ${BLUE}
EOF
                    '''
                }
            }
        }
    }

    post {
        success {
            echo "✅ SUCCESS: ${BRANCH_NAME} deployed"
        }

        failure {
            echo "❌ FAILED: ${BRANCH_NAME}"

            script {
                if (env.BRANCH_NAME == 'main') {
                    withCredentials([sshUserPrivateKey(credentialsId: 'ec2-ssh-key', keyFileVariable: 'KEY', usernameVariable: 'USER')]) {
                        sh '''
                        ssh -i $KEY -o StrictHostKeyChecking=no $USER@${EC2_IP} << EOF
echo "Rollback triggered"
sudo systemctl reload nginx
EOF
                        '''
                    }
                }
            }
        }
    }
}