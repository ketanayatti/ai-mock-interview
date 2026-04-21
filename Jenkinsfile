pipeline {
    agent {
        docker {
            image 'node:18'
            args '-v /var/run/docker.sock:/var/run/docker.sock'
        }
    }

    options {
        timestamps()
        timeout(time: 45, unit: 'MINUTES')
    }

    environment {
        IMAGE_NAME = 'ai-mock-interview'
        DOCKER_USER = 'kethanayatti'
        EC2_IP = '13.220.61.216'
        CONTAINER_NAME = 'app-blue'
        PORT = '3000'
        REGISTRY = "${DOCKER_USER}/${IMAGE_NAME}"
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
                node -v
                npm -v
                docker -v
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
                script {
                    if (env.BRANCH_NAME == 'main') {
                        sh 'npm run lint'
                    } else {
                        sh 'npm run lint || echo "Lint skipped in dev"'
                    }
                }
            }
        }

        stage('Test') {
            steps {
                sh 'npm test'
            }
        }

        stage('Security Scan') {
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
                docker build -t ${REGISTRY}:${BUILD_NUMBER} .
                docker tag ${REGISTRY}:${BUILD_NUMBER} ${REGISTRY}:latest
                '''
            }
        }

        stage('Push to Docker Hub') {
            when {
                branch 'main'
            }
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'docker-credentials',
                    usernameVariable: 'USER',
                    passwordVariable: 'PASS'
                )]) {
                    sh '''
                    echo "$PASS" | docker login -u "$USER" --password-stdin

                    docker push ${REGISTRY}:${BUILD_NUMBER}
                    docker push ${REGISTRY}:latest

                    docker logout
                    '''
                }
            }
        }

        stage('Deploy to EC2') {
            when {
                branch 'main'
            }
            steps {
                withCredentials([sshUserPrivateKey(
                    credentialsId: 'ec2-ssh-key',
                    keyFileVariable: 'SSH_KEY',
                    usernameVariable: 'SSH_USER'
                )]) {

                    sh '''
                    ssh -i $SSH_KEY -o StrictHostKeyChecking=no ${SSH_USER}@${EC2_IP} << EOF

                    docker pull ${REGISTRY}:latest

                    docker stop ${CONTAINER_NAME} || true
                    docker rm ${CONTAINER_NAME} || true

                    docker run -d \
                        -p ${PORT}:${PORT} \
                        --name ${CONTAINER_NAME} \
                        --restart always \
                        ${REGISTRY}:latest

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
                withCredentials([sshUserPrivateKey(
                    credentialsId: 'ec2-ssh-key',
                    keyFileVariable: 'SSH_KEY',
                    usernameVariable: 'SSH_USER'
                )]) {

                    sh '''
                    ssh -i $SSH_KEY -o StrictHostKeyChecking=no ${SSH_USER}@${EC2_IP} << EOF

                    sleep 5

                    for i in {1..5}; do
                        curl -f http://localhost:${PORT}/health && exit 0
                        sleep 3
                    done

                    exit 1

                    EOF
                    '''
                }
            }
        }
    }

    post {
        success {
            echo "CI/CD SUCCESS: ${BRANCH_NAME}"
        }
        failure {
            echo "CI/CD FAILED: ${BRANCH_NAME}"
        }
    }
}