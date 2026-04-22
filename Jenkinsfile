
pipeline {
    agent any

    environment {
        REGISTRY  = "docker.io/kethanayatti/ai-mock-interview"
        EC2_IP    = "13.220.61.216"
        STATE_DIR = "/tmp/bg-state"
    }

    options {
        timestamps()
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
    }

    stages {

        stage('Checkout') {
            steps { checkout scm }
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
                sh "docker build -t ${REGISTRY}:latest -t ${REGISTRY}:${BUILD_NUMBER} ."
            }
        }

        stage('Push Image') {
            when { branch 'main' }
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'docker-credentials',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    sh '''
                        echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin
                        docker push "$REGISTRY":latest
                        docker push "$REGISTRY":"$BUILD_NUMBER"
                        docker logout
                    '''
                }
            }
        }

        stage('Deploy — Idle Slot') {
            when { branch 'main' }
            steps {
                withCredentials([
                    sshUserPrivateKey(credentialsId: 'ec2-ssh-key', keyFileVariable: 'KEY', usernameVariable: 'SSH_USER'),
                    string(credentialsId: 'mongo-uri',      variable: 'MONGO_URI'),
                    string(credentialsId: 'gemini-api-key', variable: 'GEMINI_API_KEY')
                ]) {
                    sh '''
                        echo "PORT=3000"                    > app.env
                        echo "MONGO_URI=$MONGO_URI"        >> app.env
                        echo "GEMINI_API_KEY=$GEMINI_API_KEY" >> app.env
                    '''

                    sh 'scp -i "$KEY" -o StrictHostKeyChecking=no app.env "$SSH_USER"@"$EC2_IP":/tmp/app.env && rm -f app.env'

                    sh '''
                        ssh -i "$KEY" -o StrictHostKeyChecking=no "$SSH_USER"@"$EC2_IP" bash -s << 'REMOTE'
set -e
NGINX_CONF="/etc/nginx/sites-available/default"
STATE_DIR="/tmp/bg-state"
mkdir -p "$STATE_DIR"

# ── SOURCE OF TRUTH: read active port from nginx ──────────────────────────
# Read port using grep -oE (avoids backslash regex that breaks Groovy parser)
# Pipeline: keep proxy_pass lines, skip comments, extract digit runs, take last
ACTIVE_PORT=$(grep 'proxy_pass' "$NGINX_CONF" | grep -v '#' | grep -oE '[0-9]+' | tail -1)

if [ -z "$ACTIVE_PORT" ]; then
    echo "WARNING: No proxy_pass found in nginx — defaulting active slot to 3000"
    ACTIVE_PORT=3000
fi

if [ "$ACTIVE_PORT" != "3000" ] && [ "$ACTIVE_PORT" != "3001" ]; then
    echo "ERROR: nginx proxy_pass references unexpected port: $ACTIVE_PORT"
    exit 1
fi

if [ "$ACTIVE_PORT" = "3000" ]; then
    IDLE_PORT=3001
    IDLE_CONTAINER="app-slot-3001"
    ACTIVE_CONTAINER="app-slot-3000"
else
    IDLE_PORT=3000
    IDLE_CONTAINER="app-slot-3000"
    ACTIVE_CONTAINER="app-slot-3001"
fi

echo "Active : port $ACTIVE_PORT  ($ACTIVE_CONTAINER)"
echo "Target : port $IDLE_PORT   ($IDLE_CONTAINER)"

echo "$ACTIVE_PORT"      > "$STATE_DIR/active_port"
echo "$IDLE_PORT"        > "$STATE_DIR/idle_port"
echo "$ACTIVE_CONTAINER" > "$STATE_DIR/active_container"
echo "$IDLE_CONTAINER"   > "$STATE_DIR/idle_container"

docker pull kethanayatti/ai-mock-interview:latest
docker rm -f "$IDLE_CONTAINER" 2>/dev/null || true
BLOCKING=$(docker ps -q --filter "publish=$IDLE_PORT")
if [ -n "$BLOCKING" ]; then
    BLOCKING_NAME=$(docker inspect --format '{{.Name}}' $BLOCKING)
    echo "WARNING: Removing container $BLOCKING_NAME blocking port $IDLE_PORT"
    docker rm -f $BLOCKING
fi
docker run -d --name "$IDLE_CONTAINER" -p "$IDLE_PORT":3000 --restart unless-stopped --env-file /tmp/app.env kethanayatti/ai-mock-interview:latest
rm -f /tmp/app.env
echo "OK: $IDLE_CONTAINER started on port $IDLE_PORT"
REMOTE
                    '''
                }
            }
        }

        stage('Health Check — Idle Slot') {
            when { branch 'main' }
            options { timeout(time: 3, unit: 'MINUTES') }
            steps {
                withCredentials([sshUserPrivateKey(
                    credentialsId: 'ec2-ssh-key',
                    keyFileVariable: 'KEY',
                    usernameVariable: 'SSH_USER'
                )]) {
                    sh '''
                        ssh -i "$KEY" -o StrictHostKeyChecking=no "$SSH_USER"@"$EC2_IP" bash -s << 'REMOTE'
set -e
STATE_DIR="/tmp/bg-state"
IDLE_PORT=$(cat "$STATE_DIR/idle_port")
IDLE_CONTAINER=$(cat "$STATE_DIR/idle_container")

echo "Checking $IDLE_CONTAINER on http://localhost:$IDLE_PORT/health (direct, bypasses nginx)..."

ATTEMPTS=12
for i in $(seq 1 $ATTEMPTS); do
    HTTP_CODE=$(curl -o /dev/null -sw '%{http_code}' "http://localhost:$IDLE_PORT/health" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        echo "OK: health check passed on attempt $i/$ATTEMPTS"
        exit 0
    fi
    echo "Attempt $i/$ATTEMPTS: HTTP $HTTP_CODE — retrying in 5s..."
    sleep 5
done

echo "FAILED: health check did not pass after $ATTEMPTS attempts"
docker logs "$IDLE_CONTAINER" --tail 50 2>&1 || true
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
NGINX_CONF="/etc/nginx/sites-available/default"
STATE_DIR="/tmp/bg-state"
ACTIVE_PORT=$(cat "$STATE_DIR/active_port")
IDLE_PORT=$(cat "$STATE_DIR/idle_port")

echo "Switching nginx: $ACTIVE_PORT -> $IDLE_PORT"

sudo cp "$NGINX_CONF" "${NGINX_CONF}.bak"

# FIX: sed uses [0-9]* — no backslash sequences, safe in Groovy
sudo sed -i "s|proxy_pass http://localhost:[0-9]*;|proxy_pass http://localhost:$IDLE_PORT;|" "$NGINX_CONF"

if ! sudo nginx -t 2>&1; then
    echo "nginx config test FAILED — restoring backup"
    sudo cp "${NGINX_CONF}.bak" "$NGINX_CONF"
    exit 1
fi

sudo systemctl reload nginx

# VERIFICATION: re-read nginx and confirm the switch took effect
# grep -oE extracts the port number without backslash regex sequences
NGINX_LIVE_PORT=$(grep 'proxy_pass' "$NGINX_CONF" | grep -v '#' | grep -oE '[0-9]+' | tail -1)

if [ "$NGINX_LIVE_PORT" != "$IDLE_PORT" ]; then
    echo "VERIFICATION FAILED: nginx shows $NGINX_LIVE_PORT, expected $IDLE_PORT"
    sudo cp "${NGINX_CONF}.bak" "$NGINX_CONF"
    sudo nginx -t && sudo systemctl reload nginx
    exit 1
fi

echo "OK: nginx verified — proxy_pass -> localhost:$NGINX_LIVE_PORT"

echo "$IDLE_PORT"   > "$STATE_DIR/current_live_port"
echo "$ACTIVE_PORT" > "$STATE_DIR/previous_live_port"
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
NGINX_CONF="/etc/nginx/sites-available/default"
STATE_DIR="/tmp/bg-state"
CURRENT_LIVE=$(cat "$STATE_DIR/current_live_port")
PREVIOUS_LIVE=$(cat "$STATE_DIR/previous_live_port")

echo "End-to-end check: nginx :80 -> container on port $CURRENT_LIVE ..."
HTTP_CODE=$(curl -o /dev/null -sw '%{http_code}' http://localhost/health 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
    echo "OK: end-to-end validation passed (HTTP $HTTP_CODE)"
    exit 0
fi

echo "FAILED (HTTP $HTTP_CODE) — rolling back"

# ROLLBACK step 1: revert nginx (source of truth first)
sudo sed -i "s|proxy_pass http://localhost:[0-9]*;|proxy_pass http://localhost:$PREVIOUS_LIVE;|" "$NGINX_CONF"
sudo nginx -t && sudo systemctl reload nginx

# ROLLBACK step 2: verify nginx is back on previous port
# grep -oE extracts port number — no backslash sequences in pattern
NGINX_PORT=$(grep 'proxy_pass' "$NGINX_CONF" | grep -v '#' | grep -oE '[0-9]+' | tail -1)
if [ "$NGINX_PORT" != "$PREVIOUS_LIVE" ]; then
    echo "CRITICAL: nginx rollback verification FAILED — manual intervention required"
    exit 2
fi

echo "OK: nginx rolled back to port $NGINX_PORT"

# ROLLBACK step 3: update state
echo "$PREVIOUS_LIVE" > "$STATE_DIR/current_live_port"
echo "$CURRENT_LIVE"  > "$STATE_DIR/previous_live_port"
exit 1
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
NGINX_CONF="/etc/nginx/sites-available/default"
STATE_DIR="/tmp/bg-state"
CURRENT_LIVE=$(cat "$STATE_DIR/current_live_port")
PREVIOUS_LIVE=$(cat "$STATE_DIR/previous_live_port")

CHECKS=12
INTERVAL=10
echo "Stability monitor: $CHECKS checks x ${INTERVAL}s — watching nginx :80 -> port $CURRENT_LIVE"
echo "Fallback available: port $PREVIOUS_LIVE (container still running)"

for i in $(seq 1 $CHECKS); do
    HTTP_CODE=$(curl -o /dev/null -sw '%{http_code}' http://localhost/health 2>/dev/null || echo "000")

    if [ "$HTTP_CODE" = "200" ]; then
        echo "Check $i/$CHECKS OK"
        sleep $INTERVAL
        continue
    fi

    echo "Check $i/$CHECKS FAILED (HTTP $HTTP_CODE) — rolling back"

    sudo sed -i "s|proxy_pass http://localhost:[0-9]*;|proxy_pass http://localhost:$PREVIOUS_LIVE;|" "$NGINX_CONF"
    sudo nginx -t && sudo systemctl reload nginx

    # FIX: grep -oE '[0-9]+' — no backslash sequences
    NGINX_PORT=$(grep 'proxy_pass' "$NGINX_CONF" | grep -v '#' | grep -oE '[0-9]+' | tail -1)
    if [ "$NGINX_PORT" != "$PREVIOUS_LIVE" ]; then
        echo "CRITICAL: nginx rollback verification FAILED — manual intervention needed"
        exit 2
    fi

    echo "OK: nginx rolled back to port $NGINX_PORT"
    echo "$PREVIOUS_LIVE" > "$STATE_DIR/current_live_port"
    echo "$CURRENT_LIVE"  > "$STATE_DIR/previous_live_port"
    exit 1
done

echo "Monitoring window passed — system stable on port $CURRENT_LIVE"
REMOTE
                    '''
                }
            }
        }

        stage('Cleanup — Old Slot') {
            when { branch 'main' }
            steps {
                withCredentials([sshUserPrivateKey(
                    credentialsId: 'ec2-ssh-key',
                    keyFileVariable: 'KEY',
                    usernameVariable: 'SSH_USER'
                )]) {
                    sh '''
                        ssh -i "$KEY" -o StrictHostKeyChecking=no "$SSH_USER"@"$EC2_IP" bash -s << 'REMOTE'
STATE_DIR="/tmp/bg-state"
PREVIOUS_LIVE=$(cat "$STATE_DIR/previous_live_port" 2>/dev/null || echo "")

if [ -z "$PREVIOUS_LIVE" ]; then
    echo "No previous port in state — skipping old container removal"
else
    OLD_CONTAINER="app-slot-$PREVIOUS_LIVE"
    echo "Removing old slot: $OLD_CONTAINER (port $PREVIOUS_LIVE)"
    docker rm -f "$OLD_CONTAINER" 2>/dev/null || true
    echo "OK: $OLD_CONTAINER removed"
fi

docker image prune -f

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
                withCredentials([sshUserPrivateKey(
                    credentialsId: 'ec2-ssh-key',
                    keyFileVariable: 'KEY',
                    usernameVariable: 'SSH_USER'
                )]) {
                    sh '''
                        ssh -i "$KEY" -o StrictHostKeyChecking=no "$SSH_USER"@"$EC2_IP" bash -s << 'REMOTE'
set -e
STATE_DIR="/tmp/bg-state"
LIVE_PORT=$(cat "$STATE_DIR/current_live_port")
echo "Load test: nginx :80 -> container on port $LIVE_PORT"

if ! command -v ab > /dev/null 2>&1; then
    echo "Installing apache2-utils..."
    sudo apt-get install -y apache2-utils -qq
fi

ab -n 200 -c 20 http://localhost/
echo "OK: load test complete"
REMOTE
                    '''
                }
            }
        }

    } 

    post {
        success {
            echo "Build #${BUILD_NUMBER} deployed and verified in production"
        }
        failure {
            echo "Build #${BUILD_NUMBER} failed — nginx state preserved for diagnosis"
        }
        always {
            sh 'rm -f app.env || true'
            cleanWs()
        }
    }
}