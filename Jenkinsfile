pipeline {
    agent any

    stages {

        stage('Deploy Staging') {
            when { branch 'develop' }
            steps {
                sh 'docker-compose down'
                sh 'docker-compose up -d --build'
            }
        }

        stage('Deploy Production') {
            when { branch 'main' }
            steps {
                sh 'docker-compose down'
                sh 'docker-compose up -d --build'
            }
        }
    }
}
