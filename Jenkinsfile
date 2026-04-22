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
                    // Write env file via shell — no Groovy interpolation on secrets
                    sh 'printf "PORT=3000\nMONGO_URI=%s\nGEMINI_API_KEY=%s\n" "$MONGO_URI" "$GEMINI_API_KEY" > app.env'

                    sh 'scp -i "$KEY" -o StrictHostKeyChecking=no app.env "$SSH_USER"@"$EC2_IP":/tmp/app.env && rm -f app.env'

                    sh '''
                        ssh -i "$KEY" -o StrictHostKeyChecking=no "$SSH_USER"@"$EC2_IP" bash -s << 'REMOTE'
set -e
NGINX_CONF="/etc/nginx/sites-available/default"
STATE_DIR="/tmp/bg-state"
mkdir -p "$STATE_DIR"

# ── SOURCE OF TRUTH: read active port from nginx ──────────────────────────
# FIX: grep command on a single line — no trailing backslash
ACTIVE_PORT=$(grep -oP 'proxy_pass\s+http://localhost:\K[0-9]+' "$NGINX_CONF" 2>/dev/null | head -1)

if [ -z "$ACTIVE_PORT" ]; then
    echo "WARNING: No proxy_pass found in nginx — defaulting active slot to 3000"
    ACTIVE_PORT=3000
fi

if [ "$ACTIVE_PORT" != "3000" ] && [ "$ACTIVE_PORT" != "3001" ]; then
    echo "ERROR: nginx proxy_pass references unexpected port: $ACTIVE_PORT"
    exit 1
fi

# Derive idle slot
if [ "$ACTIVE_PORT" = "3000" ]; then
    IDLE_PORT=3001
    IDLE_CONTAINER="app-slot-3001"
    ACTIVE_CONTAINER="app-slot-3000"
else
    IDLE_PORT=3000
    IDLE_CONTAINER="app-slot-3000"
    ACTIVE_CONTAINER="app-slot-3001"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Nginx (source of truth)"
echo "    Live  : port $ACTIVE_PORT  ($ACTIVE_CONTAINER)"
echo "    Target: port $IDLE_PORT   ($IDLE_CONTAINER)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Persist state for all downstream stages
echo "$ACTIVE_PORT"      > "$STATE_DIR/active_port"
echo "$IDLE_PORT"        > "$STATE_DIR/idle_port"
echo "$ACTIVE_CONTAINER" > "$STATE_DIR/active_container"
echo "$IDLE_CONTAINER"   > "$STATE_DIR/idle_container"

# Pull new image
docker pull kethanayatti/ai-mock-interview:latest

# Replace idle slot container
docker rm -f "$IDLE_CONTAINER" 2>/dev/null || true

# FIX: docker run on a single line — no trailing backslash
docker run -d --name "$IDLE_CONTAINER" -p "$IDLE_PORT":3000 --restart unless-stopped --env-file /tmp/app.env kethanayatti/ai-mock-interview:latest

rm -f /tmp/app.env
echo "✅ $IDLE_CONTAINER started on port $IDLE_PORT"
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

echo "Checking $IDLE_CONTAINER directly on http://localhost:$IDLE_PORT/health ..."
echo "(bypasses nginx — validates new container in isolation)"

ATTEMPTS=12
for i in $(seq 1 $ATTEMPTS); do
    # FIX: curl command on a single line — no trailing backslash
    HTTP_CODE=$(curl -o /dev/null -sw '%{http_code}' "http://localhost:$IDLE_PORT/health" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        echo "✅ Health check passed on attempt $i/$ATTEMPTS (HTTP $HTTP_CODE)"
        exit 0
    fi
    echo "  Attempt $i/$ATTEMPTS → HTTP $HTTP_CODE — waiting 5s..."
    sleep 5
done

echo "❌ Health check FAILED after $ATTEMPTS attempts — dumping container logs:"
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

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Switching nginx: $ACTIVE_PORT  →  $IDLE_PORT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Backup config before touching it
sudo cp "$NGINX_CONF" "${NGINX_CONF}.bak"

# FIX: sed on a single line — no trailing backslash
sudo sed -i "s|proxy_pass http://localhost:[0-9]*;|proxy_pass http://localhost:$IDLE_PORT;|" "$NGINX_CONF"

# Validate — restore backup if config is broken
if ! sudo nginx -t 2>&1; then
    echo "❌ nginx config test FAILED — restoring backup"
    sudo cp "${NGINX_CONF}.bak" "$NGINX_CONF"
    exit 1
fi

sudo systemctl reload nginx

# VERIFICATION: re-read nginx to confirm proxy_pass updated correctly
# FIX: grep on a single line — no trailing backslash
NGINX_LIVE_PORT=$(grep -oP 'proxy_pass\s+http://localhost:\K[0-9]+' "$NGINX_CONF" 2>/dev/null | head -1)

if [ "$NGINX_LIVE_PORT" != "$IDLE_PORT" ]; then
    echo "❌ VERIFICATION FAILED: nginx shows port $NGINX_LIVE_PORT, expected $IDLE_PORT"
    echo "   Restoring backup and reloading..."
    sudo cp "${NGINX_CONF}.bak" "$NGINX_CONF"
    sudo nginx -t && sudo systemctl reload nginx
    exit 1
fi

echo "✅ nginx verified — proxy_pass → http://localhost:$NGINX_LIVE_PORT"

# Persist confirmed state
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

echo "Validating end-to-end: nginx :80 → container on port $CURRENT_LIVE ..."

# FIX: curl on a single line — no trailing backslash
HTTP_CODE=$(curl -o /dev/null -sw '%{http_code}' http://localhost/health 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ End-to-end validation passed (HTTP $HTTP_CODE)"
    exit 0
fi

echo "❌ Validation FAILED (HTTP $HTTP_CODE) — rolling back"

# ROLLBACK STEP 1: revert nginx first (source of truth)
# FIX: sed on a single line — no trailing backslash
sudo sed -i "s|proxy_pass http://localhost:[0-9]*;|proxy_pass http://localhost:$PREVIOUS_LIVE;|" "$NGINX_CONF"
sudo nginx -t && sudo systemctl reload nginx

# ROLLBACK STEP 2: verify nginx is back on previous port
NGINX_PORT=$(grep -oP 'proxy_pass\s+http://localhost:\K[0-9]+' "$NGINX_CONF" | head -1)
if [ "$NGINX_PORT" != "$PREVIOUS_LIVE" ]; then
    echo "🚨 CRITICAL: nginx rollback verification FAILED — manual intervention required"
    echo "   nginx shows: $NGINX_PORT  |  expected: $PREVIOUS_LIVE"
    exit 2
fi

echo "✅ Nginx rolled back and verified → port $NGINX_PORT"

# ROLLBACK STEP 3: update state
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
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Stability monitor: $CHECKS checks x ${INTERVAL}s = $(( CHECKS * INTERVAL ))s"
echo "  Watching: nginx :80  →  port $CURRENT_LIVE"
echo "  Fallback: port $PREVIOUS_LIVE (container still running)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for i in $(seq 1 $CHECKS); do
    # FIX: curl on a single line — no trailing backslash
    HTTP_CODE=$(curl -o /dev/null -sw '%{http_code}' http://localhost/health 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        echo "  Check $i/$CHECKS OK (HTTP $HTTP_CODE)"
        sleep $INTERVAL
        continue
    fi

    echo "❌ Check $i/$CHECKS FAILED (HTTP $HTTP_CODE) — rolling back"

    # ROLLBACK: nginx first → verify
    # FIX: sed on a single line — no trailing backslash
    sudo sed -i "s|proxy_pass http://localhost:[0-9]*;|proxy_pass http://localhost:$PREVIOUS_LIVE;|" "$NGINX_CONF"
    sudo nginx -t && sudo systemctl reload nginx

    NGINX_PORT=$(grep -oP 'proxy_pass\s+http://localhost:\K[0-9]+' "$NGINX_CONF" | head -1)
    if [ "$NGINX_PORT" != "$PREVIOUS_LIVE" ]; then
        echo "CRITICAL: nginx rollback verification FAILED — manual intervention needed"
        exit 2
    fi

    echo "✅ Nginx rolled back and verified → port $NGINX_PORT"
    echo "$PREVIOUS_LIVE" > "$STATE_DIR/current_live_port"
    echo "$CURRENT_LIVE"  > "$STATE_DIR/previous_live_port"
    exit 1
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Monitoring window passed — system stable on port $CURRENT_LIVE"
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
    echo "✅ $OLD_CONTAINER removed"
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
echo "Load test: nginx :80 → container on port $LIVE_PORT"

if ! command -v ab > /dev/null 2>&1; then
    echo "Installing apache2-utils for ab..."
    sudo apt-get install -y apache2-utils -qq
fi

ab -n 200 -c 20 http://localhost/
echo "✅ Load test complete"
REMOTE
                    '''
                }
            }
        }

    } 

    post {
        success {
            echo "🚀 Build #${BUILD_NUMBER} deployed and verified in production"
        }
        failure {
            echo "❌ Build #${BUILD_NUMBER} failed — nginx state preserved for diagnosis"
        }
        always {
            sh 'rm -f app.env || true'
            cleanWs()
        }
    }
}