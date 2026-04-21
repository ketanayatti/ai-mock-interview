pipeline {
    agent any
    
    options {
        timestamps()
        timeout(time: 1, unit: 'HOURS')
    }
    
    environment {
        IMAGE_NAME = 'ai-mock-interview'
        DOCKER_USER = 'kethanayatti'
        EC2_IP = '13.220.61.216'
        CONTAINER_NAME = 'app-blue'
        PORT = '3000'
        REGISTRY_URL = "docker.io/${DOCKER_USER}/${IMAGE_NAME}"
        PATH = "/home/ubuntu/.nvm/versions/node/v24.15.0/bin:${PATH}"
    }
    
    stages {
        stage('Verify Environment') {
            steps {
                sh '''
                    echo "Node version:"
                    node --version
                    echo "NPM version:"
                    npm --version
                    echo "✓ Node.js environment verified"
                '''
            }
        }
        
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        
        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }
        
        stage('Lint') {
            steps {
                catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
                    sh 'npm run lint || echo "No lint script configured"'
                }
            }
        }
        
        stage('Test') {
            steps {
                catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
                    sh 'npm test'
                }
            }
        }
        
        stage('Security Audit') {
            when {
                branch 'main'
            }
            steps {
                sh 'npm audit --audit-level=high'
            }
        }
        
        stage('Build Docker Image') {
            steps {
                sh '''
                    docker build -t ${REGISTRY_URL}:latest .
                    docker build -t ${REGISTRY_URL}:${BUILD_NUMBER} .
                '''
            }
        }
        
        stage('Push to Docker Hub') {
            when {
                branch 'main'
            }
            steps {
                withCredentials([usernamePassword(credentialsId: 'docker-credentials', usernameVariable: 'DOCKER_USER_CRED', passwordVariable: 'DOCKER_PASS')]) {
                    sh '''
                        echo $DOCKER_PASS | docker login -u $DOCKER_USER_CRED --password-stdin
                        docker push ${REGISTRY_URL}:latest
                        docker push ${REGISTRY_URL}:${BUILD_NUMBER}
                        docker logout
                    '''
                }
            }
        }
        
        stage('Deploy to AWS EC2') {
            when {
                branch 'main'
            }
            steps {
                withCredentials([sshUserPrivateKey(credentialsId: 'ec2-ssh-key', keyFileVariable: 'SSH_KEY', usernameVariable: 'SSH_USER')]) {
                    sh '''
                        ssh -i $SSH_KEY -o StrictHostKeyChecking=no ${SSH_USER}@${EC2_IP} << 'EOF'
                            docker pull ${REGISTRY_URL}:latest
                            docker stop ${CONTAINER_NAME} 2>/dev/null || true
                            docker rm ${CONTAINER_NAME} 2>/dev/null || true
                            docker run -d \
                                -p ${PORT}:${PORT} \
                                --name ${CONTAINER_NAME} \
                                --restart always \
                                ${REGISTRY_URL}:latest
                        EOF
                    '''
                }
            }
        }
        
        stage('Health Check') {
            when {
                branch 'main'
            }
            steps {
                withCredentials([sshUserPrivateKey(credentialsId: 'ec2-ssh-key', keyFileVariable: 'SSH_KEY', usernameVariable: 'SSH_USER')]) {
                    sh '''
                        sleep 5
                        ssh -i $SSH_KEY -o StrictHostKeyChecking=no ${SSH_USER}@${EC2_IP} "curl -f http://localhost:${PORT}/health" || exit 1
                    '''
                }
            }
        }
    }
    
    post {
        success {
            echo "✓ Pipeline succeeded for branch: ${BRANCH_NAME}"
        }
        failure {
            echo "✗ Pipeline failed for branch: ${BRANCH_NAME}"
        }
    }
}
