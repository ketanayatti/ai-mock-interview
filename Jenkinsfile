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

                echo "PORT=3000" > .env
                echo "JWT_SECRET=$JWT_SECRET" >> .env
                echo "SESSION_SECRET=$SESSION_SECRET" >> .env
                echo "MONGO_URI=$MONGO_URI" >> .env
                echo "GMAIL_USER=$GMAIL_USER" >> .env
                echo "GMAIL_PASS=$GMAIL_PASS" >> .env
                echo "GEMINI_API_KEY=$GEMINI_API_KEY" >> .env
                echo "API_KEY=$API_KEY" >> .env
                echo "OPENAI_API_KEY=$OPENAI_API_KEY" >> .env
                echo "COHERE_API_KEY=$COHERE_API_KEY" >> .env
                '''
            }
        }

        stage('Deploy Staging') {
    when { branch 'develop' }
    steps {
        sh '''
        echo "Cleaning old containers..."

        docker compose down --remove-orphans || true
        docker rm -f ai-mock-interview-mongo || true

        echo "Starting fresh deployment..."
        docker compose up -d --build
        '''
    }
}

        stage('Deploy Production') {
            when { branch 'main' }
            steps {
                sh 'docker compose -f docker-compose.prod.yml down'
                sh 'docker compose -f docker-compose.prod.yml up -d --build'
            }
        }
    }

    post {

        success {
            emailext(
                subject: "✅ SUCCESS: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                body: """
                <h2>Build Successful</h2>
                <p><b>Job:</b> ${env.JOB_NAME}</p>
                <p><b>Branch:</b> ${env.BRANCH_NAME}</p>
                <p><b>Build:</b> ${env.BUILD_NUMBER}</p>
                <p><a href="${env.BUILD_URL}">Open Build</a></p>
                """,
                mimeType: 'text/html',
                to: 'kethanayatti333@gmail.com'
            )
        }

        failure {
            emailext(
                subject: "❌ FAILED: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                body: """
                <h2>Build Failed</h2>
                <p><b>Job:</b> ${env.JOB_NAME}</p>
                <p><b>Branch:</b> ${env.BRANCH_NAME}</p>
                <p><b>Build:</b> ${env.BUILD_NUMBER}</p>
                <p><a href="${env.BUILD_URL}">Check Console Logs</a></p>
                """,
                mimeType: 'text/html',
                to: 'kethanayatti333@gmail.com'
            )
        }
    }
}