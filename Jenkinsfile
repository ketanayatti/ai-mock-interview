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
            when {
                branch 'develop'
            }
            steps {
                sh 'docker compose down'
                sh 'docker compose up -d --build'
            }
        }

        stage('Deploy Production') {
            when {
                branch 'main'
            }
            steps {
                sh 'docker compose -f docker-compose.prod.yml down'
                sh 'docker compose -f docker-compose.prod.yml up -d --build'
            }
        }
    }

    post {
    success {
        echo "DEBUG: ABOUT TO SEND EMAIL"

        emailext(
            subject: "TEST EMAIL FROM JENKINS",
            body: "If you received this, emailext works.",
            to: "kethanayatti333@gmail.com"
        )

        echo "DEBUG: EMAIL STEP FINISHED"
    }
}
}