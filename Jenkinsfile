pipeline {
    agent any

    environment {
        JWT_SECRET     = credentials('JWT_SECRET')
        SESSION_SECRET = credentials('SESSION_SECRET')
        MONGO_URI      = credentials('MONGO_URI')
        GMAIL_USER     = credentials('GMAIL_USER')
        GMAIL_PASS     = credentials('GMAIL_PASS')
        GEMINI_API_KEY = credentials('GEMINI_API_KEY')
        API_KEY        = credentials('API_KEY')
        OPENAI_API_KEY = credentials('OPENAI_API_KEY')
        COHERE_API_KEY = credentials('COHERE_API_KEY')
    }

    stages {

        stage('Prepare Environment') {
            steps {
                sh '''
                echo "Creating runtime .env file"

                cat <<EOF > .env
PORT=3000
JWT_SECRET=$JWT_SECRET
SESSION_SECRET=$SESSION_SECRET
MONGO_URI=$MONGO_URI
GMAIL_USER=$GMAIL_USER
GMAIL_PASS=$GMAIL_PASS
GEMINI_API_KEY=$GEMINI_API_KEY
API_KEY=$API_KEY
OPENAI_API_KEY=$OPENAI_API_KEY
COHERE_API_KEY=$COHERE_API_KEY
EOF
                '''
            }
        }

        stage('Deploy Staging') {
            when { branch 'develop' }
            steps {
                sh '''
                echo "Stopping old containers..."
                docker compose down --remove-orphans || true

                echo "Removing containers..."
                docker rm -f ai-mock-interview || true
                docker rm -f ai-mock-interview-mongo || true

                echo "Cleaning networks..."
                docker network prune -f || true

                echo "Deploying containers..."
                docker compose up -d --build
                '''
            }
        }

        stage('Deploy Production') {
            when { branch 'main' }
            steps {
                sh '''
                docker compose -f docker-compose.prod.yml down || true
                docker compose -f docker-compose.prod.yml up -d --build
                '''
            }
        }
    }

    post {
        always {
            script {
                emailext(
                    to: "${env.GMAIL_USER}",
                    subject: "Build ${currentBuild.currentResult}: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                    mimeType: 'text/html',
                    body: """
                        <div style="font-family: sans-serif;">
                            <h2 style="color: ${currentBuild.currentResult == 'SUCCESS' ? 'green' : 'red'};">
                                Build ${currentBuild.currentResult}
                            </h2>
                            <p><b>Job:</b> ${env.JOB_NAME}</p>
                            <p><b>Branch:</b> ${env.BRANCH_NAME}</p>
                            <p><b>Status:</b> ${currentBuild.currentResult}</p>
                            <hr>
                            <p><a href="${env.BUILD_URL}">View full build details in Jenkins</a></p>
                        </div>
                    """
                )
            }
        }
    }
}
