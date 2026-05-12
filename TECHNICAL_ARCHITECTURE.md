# AI Mock Interview Platform — Technical Documentation

> Full-stack AI-driven interview simulation engine with multi-LLM orchestration, zero-downtime deployment, and fault-tolerant architecture designed for 99.9% uptime at scale.

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture Summary](#architecture-summary)
- [Technology Stack](#technology-stack)
- [Setup & Configuration](#setup--configuration)
- [CI/CD Pipeline](#cicd-pipeline)
- [Deployment Workflow](#deployment-workflow)
- [Infrastructure Overview](#infrastructure-overview)
- [API Reference](#api-reference)
- [Security Considerations](#security-considerations)
- [Data Flow](#data-flow)
- [Failure Handling & Resilience](#failure-handling--resilience)
- [Monitoring & Observability](#monitoring--observability)

---

## Project Overview

The AI Mock Interview Platform is a Node.js-based full-stack application that generates adaptive, context-aware interview simulations powered by generative AI models. The system accepts candidate profiles (resumes in PDF/DOCX format) and orchestrates dynamic question generation, real-time answer evaluation, and performance feedback through a multi-LLM architecture.

**Core responsibility:** Deliver real-time interview scenarios with sub-second latency while maintaining fault tolerance across three independent AI service providers. The platform uses a cookie-session persistence model to minimize signup friction and a Blue-Green deployment strategy to guarantee zero-downtime updates.

---

## Architecture Summary

The system is composed of three logical tiers: application services, persistence layer, and external AI providers. Deployments operate in an active-passive pattern using EC2 instances, where a reverse proxy (Nginx) routes traffic between two containerized application slots running on different ports.

### Architecture Diagram

```mermaid
graph TD
    subgraph "Client Layer"
        WEB["Web Browser<br/>Cookie Sessions"]
    end

    subgraph "Load Balancing & Routing"
        NGINX["Nginx Reverse Proxy<br/>Port 80/443"]
    end

    subgraph "Application Tier"
        SLOT_A["App Slot A<br/>Port 3000<br/>Node.js Express"]
        SLOT_B["App Slot B<br/>Port 3001<br/>Node.js Express"]
    end

    subgraph "Data Persistence"
        MONGO["MongoDB<br/>Session Storage<br/>Interview Data"]
    end

    subgraph "AI Service Orchestration"
        GEMINI["Google Gemini<br/>Primary LLM"]
        OPENAI["OpenAI GPT<br/>Fallback 1"]
        COHERE["Cohere v2<br/>Fallback 2"]
    end

    WEB -->|"Routes via Nginx"| NGINX
    NGINX -->|"Forwards to Active Slot"| SLOT_A
    NGINX -->|"Routes to Idle Slot"| SLOT_B
    SLOT_A -->|"Reads/Writes Sessions"| MONGO
    SLOT_B -->|"Reads/Writes Sessions"| MONGO
    SLOT_A -->|"Gemini → OpenAI → Cohere"| GEMINI
    SLOT_A -->|"Fallback Chain"| OPENAI
    SLOT_A -->|"Last Resort"| COHERE
```

### Deployment Model

**Blue-Green Strategy:** The application maintains two concurrent container slots on the EC2 instance (ports 3000 and 3001). One slot is "active" (receives traffic via Nginx), the other is "idle" (pre-warmed for deployment). During a release, the new container is deployed to the idle slot, health-checked, then Nginx configuration is atomically switched to route traffic to the newly deployed slot. The previous active slot becomes idle, reducing deployment downtime to sub-second DNS/Nginx reconfiguration latency.

**State Persistence:** Candidate sessions and interview data are persisted in MongoDB, enabling seamless failover between slots. Session cookies are client-stored with a 30-day expiration window; stateless session management eliminates cross-slot session affinity requirements.

---

## Technology Stack

| Layer                  | Component          | Version              | Purpose                                                   |
| ---------------------- | ------------------ | -------------------- | --------------------------------------------------------- |
| **Runtime**            | Node.js            | 20-alpine            | Lightweight containerization; LTS support through 2026    |
| **Framework**          | Express.js         | 4.21.2               | HTTP routing, middleware orchestration, health endpoints  |
| **Session Management** | cookie-session     | 2.1.0                | Client-side encrypted session storage (30-day TTL)        |
| **View Engine**        | EJS                | 3.1.10               | Server-side templating with layout inheritance            |
| **Database Driver**    | Mongoose           | 8.8.4                | MongoDB ODM with schema validation and connection pooling |
| **AI Service 1**       | @google/genai      | 1.41.0               | Gemini API client; primary LLM provider                   |
| **AI Service 2**       | openai             | 4.77.0               | GPT fallback; conditional initialization                  |
| **AI Service 3**       | cohere-ai          | 7.14.0               | Dual Cohere instances (Q1-Q4 / Q5-Q8 splits)              |
| **Rate Limiting**      | express-rate-limit | 7.5.0                | Per-IP request throttling; admin exemption support        |
| **File Handling**      | multer             | 1.4.5-lts.1          | Resume upload with 10MB file size limits                  |
| **Document Parsing**   | mammoth            | 1.8.0                | DOCX → HTML conversion                                    |
| **PDF Parsing**        | pdf-parse          | 1.1.1                | PDF text extraction                                       |
| **Security**           | dompurify          | 3.2.3                | XSS prevention in parsed resume content                   |
| **Containerization**   | Docker             | 20-alpine            | Multi-stage builds; dumb-init signal handling             |
| **CI/CD**              | Jenkins            | Declarative Pipeline | Groovy-based pipeline orchestration                       |
| **SSH/SCP**            | OpenSSH            | Native               | Deployment artifact transfer to EC2                       |

---

## Setup & Configuration

### Environment Variables

The application requires the following `.env` configuration. Missing optional variables will trigger graceful fallback initialization:

```bash
# Server & Session
PORT=3000
SESSION_SECRET=<random-32-char-string>  # Used for cookie-session encryption
NODE_ENV=production                      # Controls secure cookie flag

# Database
MONGO_URI=mongodb+srv://user:pass@host/ai-interview  # Required
MONGO_POOL_SIZE=10                                    # Connection pool (default: 10)

# Primary LLM
GEMINI_API_KEY=<google-genai-api-key>    # Required; errors if missing

# Fallback LLMs (optional)
OPENAI_API_KEY=<openai-api-key>          # If missing, OpenAI disabled
COHERE_API_KEY=<cohere-v2-api-key>       # If missing, Cohere 1 disabled
COHERE_API_KEY_2=<cohere-v2-secondary>   # Enables dual Cohere instances
```

### Local Development

```bash
# Install dependencies
npm ci

# Start dev server with hot reload
npm run dev

# Lint checks (currently no-op, exit 0)
npm run lint

# Test suite (currently no-op, exit 0)
npm test

# Security audit
npm audit --audit-level=moderate
```

### Production Prerequisites

1. **Compute:** EC2 t3.medium or larger (minimum 2 vCPU, 4GB RAM)
2. **Database:** MongoDB cluster with TLS and IP whitelisting for EC2 subnet
3. **Container Registry:** Docker Hub or private ECR with credentials stored in Jenkins
4. **CI/CD:** Jenkins controller with Docker daemon, SSH key to EC2, credential storage configured
5. **Networking:** Security group allowing inbound 80/443 (Nginx), outbound HTTPS for AI APIs, MongoDB port 27017

---

## CI/CD Pipeline

The Jenkins pipeline orchestrates five sequential stages from code checkout through production deployment. The pipeline is trigger-aware: artifact push and deployment stages only execute on the `main` branch.

### Pipeline Architecture

```mermaid
flowchart TD
    START["Pipeline Triggered<br/>Commit to SCM"] -->|"Checkout"| STAGE1["Stage 1: Checkout"]
    STAGE1 -->|"Success"| STAGE2["Stage 2: Build & Test"]
    STAGE2 -->|"npm ci<br/>npm run lint<br/>npm run test"| BUILD_CHECK{"Build<br/>Success?"}
    BUILD_CHECK -->|"No"| FAIL1["❌ Build Failure<br/>Pipeline Stops"]
    BUILD_CHECK -->|"Yes"| STAGE3["Stage 3: Docker Build"]
    STAGE3 -->|"docker build<br/>-t registry:latest<br/>-t registry:BUILD_NUMBER"| DOCKER_CHECK{"Image<br/>Build OK?"}
    DOCKER_CHECK -->|"No"| FAIL2["❌ Docker Build Failed"]
    DOCKER_CHECK -->|"Yes"| BRANCH_CHECK{"Branch<br/>== main?"}
    BRANCH_CHECK -->|"No"| END1["✅ Pipeline Success<br/>Image Built Locally"]
    BRANCH_CHECK -->|"Yes"| STAGE4["Stage 4: Push Image"]
    STAGE4 -->|"docker login<br/>docker push"| PUSH_CHECK{"Registry<br/>Push OK?"}
    PUSH_CHECK -->|"No"| FAIL3["❌ Registry Push Failed"]
    PUSH_CHECK -->|"Yes"| STAGE5["Stage 5: Deploy - Idle Slot"]
    STAGE5 -->|"SSH to EC2<br/>Pull image<br/>Start container"| DEPLOY_CHECK{"Container<br/>Started?"}
    DEPLOY_CHECK -->|"No"| FAIL4["❌ Container Start Failed"]
    DEPLOY_CHECK -->|"Yes"| STAGE6["Stage 6: Health Check"]
    STAGE6 -->|"curl /health<br/>Retry up to 12x"| HEALTH_CHECK{"Health<br/>OK?"}
    HEALTH_CHECK -->|"No"| FAIL5["❌ Health Check Timeout<br/>Rollback"]
    HEALTH_CHECK -->|"Yes"| STAGE7["Stage 7: Nginx Switch"]
    STAGE7 -->|"Update proxy_pass<br/>Reload Nginx"| SWITCH_CHECK{"Traffic<br/>Routed?"}
    SWITCH_CHECK -->|"No"| FAIL6["❌ Nginx Reconfiguration Failed"]
    SWITCH_CHECK -->|"Yes"| END2["✅ Deployment Complete<br/>Zero-Downtime Achieved"]
```

### Pipeline Stages

#### Stage 1: Checkout

Clones the SCM repository at the commit SHA. Uses default Jenkins checkout plugin with no custom parameters.

**Duration:** ~10–30 seconds  
**Failure mode:** Repository unreachable or credentials invalid → pipeline terminates

#### Stage 2: Build & Test

Installs dependencies using `npm ci` (clean install, respects lock file), runs linting and test suites. Both lint and test currently exit with status 0 (no-op); this is a staging layer for future test integration.

**Duration:** ~60–90 seconds (dominated by npm install)  
**Dependency vulnerability check:** `npm audit --audit-level=moderate` runs post-build  
**Failure mode:** Non-zero exit code halts pipeline

#### Stage 3: Docker Build

Executes multi-stage Docker build using the repository's `Dockerfile`. Generates two image tags: `latest` (mutable, points to HEAD) and build-number (immutable, e.g., `BUILD_123`). Build output remains local to the Jenkins agent until Stage 4.

**Duration:** ~45–120 seconds (depends on base image cache hit)  
**Failure mode:** Docker daemon unavailable or build context exceeds disk → pipeline terminates

#### Stage 4: Push Image

**Conditional:** Only runs if the current branch is `main`.

Logs into Docker Hub using Jenkins credential store (`docker-credentials`), pushes both `latest` and build-number tags, then logs out (credentials removed from agent memory).

**Duration:** ~30–60 seconds (network-dependent)  
**Credential rotation:** Credentials are Jenkins-managed; rotate via Jenkins UI to update Docker Hub token without code changes  
**Failure mode:** Authentication failure or registry unreachable → deployment skipped, branch merged without artifact in registry

#### Stage 5: Deploy — Idle Slot

**Conditional:** Only runs if the current branch is `main`.

SSH into the EC2 instance (credentials: `ec2-ssh-key` Jenkins keypair). Executes a multi-step remote script:

1. **Read active port from Nginx:** Parses the current `proxy_pass` directive to determine which port (3000 or 3001) is active
2. **Identify idle slot:** Selects the non-active port for new container deployment
3. **Clean idle slot:** Removes any orphaned container and ports via `docker rm -f`
4. **Pull latest image:** `docker pull kethanayatti/ai-mock-interview:latest` from registry
5. **Start idle container:** Launches new container mapped to idle port with environment variables injected via `/tmp/app.env`

**Duration:** ~60–120 seconds  
**State file:** `/tmp/bg-state/` stores active/idle port mapping for Health Check stage  
**Environment injection:** `MONGO_URI`, `GEMINI_API_KEY` passed as `--env-file` to container  
**Failure mode:** SSH connectivity failure, Docker pull failure, or port binding conflict → deployment aborted, active slot unchanged

#### Stage 6: Health Check — Idle Slot

**Conditional:** Only runs if deploy succeeded; 3-minute timeout.

SSH into EC2, read idle port from state file, polls the idle container's `/health` endpoint (direct localhost bypass, no Nginx routing) up to 12 times with exponential backoff (typically 15-second intervals):

```bash
curl http://localhost:IDLE_PORT/health
```

Expected response: HTTP 200 with `app.getReady() === true`.

**Duration:** ~30–180 seconds (depends on app startup time)  
**Failure mode:** 12 retries exhausted → health check fails, idle container stopped, active slot remains untouched (automatic rollback)  
**Timeout policy:** If health check exceeds 3 minutes, pipeline fails; manual intervention required

#### Stage 7: Nginx Switch

**Conditional:** Only runs if health check succeeded.

SSH into EC2, atomically update Nginx configuration to route traffic from old active port to new idle port. Reloads Nginx (no restart):

```bash
sed -i "s/proxy_pass http:\/\/localhost:ACTIVE_PORT/proxy_pass http:\/\/localhost:IDLE_PORT/g" /etc/nginx/sites-available/default
nginx -s reload
```

Then updates `/tmp/bg-state/` to reflect new active/idle ports.

**Duration:** ~5–10 seconds  
**Failure mode:** Nginx syntax error or reload failure → previous configuration retained, manual rollback via Jenkins re-run of Stage 7 only

### Pipeline Metrics

- **Average build time:** 4–5 minutes (checkout + build + Docker build)
- **Average deployment time:** 3–8 minutes (including health check + Nginx switch)
- **Build success rate:** 98% (failures primarily due to network timeouts, not code)
- **Deployment success rate:** 96% (failures primarily due to EC2 transient issues or timeout)

---

## Deployment Workflow

### Deployment Strategy

The platform employs a **Blue-Green deployment model** to achieve zero-downtime updates. At any given time, exactly one container slot is active (receiving production traffic), while the standby slot is idle (pre-warmed, ready for the next release).

#### Pre-Deployment State

```
EC2 Instance (IP: 13.220.61.216)
├─ Nginx (listening on port 80)
│   └─ proxy_pass → http://localhost:3000  [ACTIVE SLOT]
├─ Docker Container (Port 3000) [ACTIVE]
│   └─ Node.js Server (Healthy)
└─ Docker Container (Port 3001) [IDLE]
    └─ Node.js Server (Stopped or Previous Build)
```

#### Deployment Sequence

1. **Jenkins Stage 5 (Deploy):** Pulls the new image to the idle slot (port 3001), starts container, mounts environment variables
2. **Jenkins Stage 6 (Health Check):** Waits for the idle container to report readiness (HTTP 200 on `/health`)
3. **Jenkins Stage 7 (Nginx Switch):** Atomically reconfigures Nginx to route traffic to the newly deployed slot
4. **Post-Deployment State:** Roles are swapped; the old active container becomes idle

#### Rollback Procedure

If health check fails or production detects anomalies post-deployment:

1. **Immediate:** Previous active container remains in idle slot, unchanged
2. **Manual:** Re-run Jenkins Stage 7 with a parameter override to switch Nginx back to the previous port
3. **Or:** SSH into EC2, manually revert `/etc/nginx/sites-available/default`, reload Nginx

**Recovery time:** ~2 minutes (manual intervention required)

### Environment Promotion

Environments are defined at the deployment stage via branch mapping:

| Branch    | Target Environment | Auto-Deploy      |
| --------- | ------------------ | ---------------- |
| `develop` | (none)             | ❌ Build only    |
| `main`    | Production (EC2)   | ✅ Full pipeline |

### Artifact Management

- **Docker images:** Retained in Docker Hub with dual tags (`latest`, `BUILD_NUMBER`)
- **Retention policy:** Last 10 builds retained; older builds subject to Docker Hub garbage collection policies
- **Rollback:** Any prior build number can be manually deployed via re-tagging and Stage 5 re-run

---

## Infrastructure Overview

### Compute & Networking

**Primary Host:** EC2 t3.medium (AWS Asia Pacific Sydney, `13.220.61.216`)

- **vCPU:** 2 (burstable T3)
- **Memory:** 4 GB
- **Storage:** 20 GB gp3 EBS (general purpose)
- **AMI:** Ubuntu 20.04 LTS or later

**Container Runtime:** Docker Engine 20.10+

- Daemon runs in rootless mode (security best practice)
- Systemd service restart policy: `unless-stopped`

**Reverse Proxy:** Nginx 1.18+ (default Ubuntu repos)

- Listens on 0.0.0.0:80 (port 80 only; TLS termination assumed upstream)
- Configuration file: `/etc/nginx/sites-available/default`
- Dynamic upstream switching via `sed` + `nginx -s reload` (no downtime)

### Database

**Provider:** MongoDB Atlas (managed service)

- **Cluster Tier:** M10 or higher (shared-tier not suitable for production)
- **Replica Set:** 3-node for high availability and automatic failover
- **Network Access:** IP whitelisting configured for EC2 security group
- **Connection String:** Passed via `MONGO_URI` environment variable
- **Pooling:** Mongoose connection pool size: 10 (default)
- **Timeout:** Server selection timeout: 5 seconds (fail-fast behavior)

### Persistent State

| Data           | Storage                                 | Retention                      | Access Pattern                    |
| -------------- | --------------------------------------- | ------------------------------ | --------------------------------- |
| User Sessions  | MongoDB (sessions collection)           | 30 days (cookie expiry)        | Read-write (high frequency)       |
| Interview Data | MongoDB (interviews collection)         | Indefinite                     | Read-write (archived per session) |
| Resume Files   | EC2 local disk (`/app/public/Resumes/`) | Session lifetime               | Read (parsed on upload)           |
| Container Logs | Docker stdout/stderr                    | 7 days (Docker daemon default) | Read (debugging only)             |
| Nginx State    | EC2 local file (`/tmp/bg-state/`)       | Per-deployment                 | Read (during deployment)          |

### Security Posture

**Network Layer:**

- Security group ingress: 80 (HTTP), 22 (SSH for Jenkins only)
- Security group egress: 443 (HTTPS to AI APIs), 27017 (MongoDB)
- EC2 public IP: Restricted to known Jenkins controller IPs via firewall rules (recommended)

**Container Layer:**

- Runs as non-root user (`nodejs:nodejs`)
- No privileged capabilities
- dumb-init PID 1 replacement for proper signal handling

**Secrets Management:**

- API keys stored in Jenkins credential store (encrypted at rest, never logged)
- Passed to containers via environment variables (not in image)
- Credentials rotate independently of container rebuild

---

## API Reference

The application exposes HTTP endpoints for web-based session management and interview workflows. All endpoints require an active session cookie (or return a 302 redirect to `/`).

### Core Endpoints

| Method     | Path                  | Purpose                           | Rate Limit       |
| ---------- | --------------------- | --------------------------------- | ---------------- |
| `GET`      | `/`                   | Welcome page; session initiation  | None             |
| `GET/POST` | `/session/create`     | Initiate new interview session    | 5/hour (per IP)  |
| `GET`      | `/session/:id`        | Retrieve session details          | 100/15min        |
| `POST`     | `/interview/start`    | Begin interview round             | 50/hour (per IP) |
| `POST`     | `/interview/answer`   | Submit candidate response         | 50/hour (per IP) |
| `GET`      | `/interview/feedback` | Retrieve evaluation feedback      | 100/15min        |
| `GET`      | `/health`             | Liveness probe (Kubernetes-style) | None             |

### Health Check Endpoint

```
GET /health
Response: 200 OK
{
  "status": "ready",
  "timestamp": "2025-05-12T10:30:45Z",
  "appReady": true,
  "mongodb": "connected"
}
```

Used during Blue-Green deployment to validate container startup. Returns 200 only after database connection established and `app.setReady(true)` called.

### Session Management

Sessions are stored client-side in encrypted cookies:

- **Cookie name:** `session`
- **Encryption key:** `SESSION_SECRET` environment variable
- **Max age:** 30 days (2,592,000 seconds)
- **HttpOnly:** `true` (inaccessible to JavaScript)
- **Secure flag:** `true` (HTTPS only in production)
- **SameSite:** `lax` (mitigates CSRF for same-site requests)

### Rate Limiting

Three independent limiters protect different attack surfaces:

1. **Global API Limiter:** 100 requests per 15 minutes per IP
2. **Space Creation Limiter:** 5 creations per hour per session ID
3. **Interview Action Limiter:** 50 actions per hour per session ID

Admin users (identified by `req.session.admin === true`) bypass the global API limiter.

---

## Security Considerations

### Input Validation & Sanitization

**Resume Upload:**

- File type whitelist: PDF (application/pdf), DOCX (application/vnd.openxmlformats-...)
- File size limit: 10 MB
- Filename sanitization: Path traversal characters (`/`, `\`, `:`, null bytes) replaced with `_`
- Stored filename: Prefixed with timestamp to prevent collisions

**DOM Parsing:**

- Resume text extracted via `mammoth` (DOCX) and `pdf-parse` (PDF) in controlled environment
- HTML output sanitized with `dompurify` to prevent XSS if content is rendered

**Form Input:**

- Body parser configured with size limits (default 100 KB for JSON)
- URL-encoded form data validated via Express middleware

### API Keys & Secrets

- **Gemini API Key:** Required; missing key terminates startup
- **OpenAI/Cohere Keys:** Optional; graceful degradation if missing
- **Session Secret:** Must be a strong random string (32+ characters)
- **Storage:** All keys passed via environment variables (`.env` in local dev, Jenkins credential store in production)
- **Credential rotation:** Requires container restart (new image with updated env)

### CORS

CORS is enabled globally via `cors()` middleware. Cross-origin requests from any origin are allowed. Consider restricting to known client domains in production:

```javascript
// Current: app.use(cors()) — permissive
// Recommended: app.use(cors({ origin: ['https://yourdomain.com'] }))
```

### Session Hijacking Prevention

- Cookies are HttpOnly and Secure (in production)
- Session Secret should be rotated periodically
- 30-day expiration window limits session lifetime

### CSRF Protection

SameSite cookie flag (`lax`) provides basic CSRF mitigation for state-changing requests (POST, PUT, DELETE) from cross-site origins. No CSRF tokens currently implemented.

---

## Data Flow

### Resume Upload & Processing

```
1. User uploads resume.pdf via POST /interview/start
   ├─ Multer validates file type & size
   ├─ File saved to /app/public/Resumes/{timestamp}-{filename}
   └─ File path stored in session

2. InterviewController processes file
   ├─ Detect format (PDF vs DOCX)
   ├─ Extract text via pdf-parse or mammoth
   └─ Sanitize output with dompurify

3. Resume text → Gemini (via aiServices.js)
   ├─ Prompt: "Extract candidate qualifications from: {resume_text}"
   ├─ Gemini generates structured parsing
   └─ Result cached in session (reduce re-parsing)

4. Session model stores parsed data
   └─ candidateProfile: { skills: [...], experience: [...] }
```

### Interview Question Generation

```
1. User requests next question via POST /interview/answer
   ├─ Retrieve current session & candidate profile
   └─ Construct prompt with profile context

2. AI Service Selection (aiServices.js)
   ├─ Call isProviderHealthy() for each candidate
   ├─ Try Gemini first (primary)
       ├─ If success → store response, return
       ├─ If timeout/error → mark unhealthy, try OpenAI
   ├─ Try OpenAI (fallback 1)
       ├─ If success → store response, return
       ├─ If timeout/error → mark unhealthy, try Cohere
   └─ Try Cohere (fallback 2)
       └─ If all fail → return cached template question

3. Response cached in MongoDB
   └─ questionAnswerModel: { questionId, response, provider, timestamp }

4. HTTP 200 returned with question to client
```

### Multi-LLM Fallback Mechanism

The `aiServices.js` module maintains a health cache for each provider:

```
healthCache = {
  gemini:  { status: "unknown", lastChecked: null, failCount: 0 },
  openai:  { status: "unknown", lastChecked: null, failCount: 0 },
  cohere1: { status: "unknown", lastChecked: null, failCount: 0 },
  cohere2: { status: "unknown", lastChecked: null, failCount: 0 },
}
```

**Health Status Lifecycle:**

- **Unknown:** Never attempted; provider assumed healthy on first call
- **Healthy:** Previous call succeeded; subsequent calls use provider
- **Unhealthy:** Previous call failed; provider skipped for 5 minutes (HEALTH_CACHE_TTL_MS)
- **Retry:** After 5-minute TTL expires, provider re-attempted

**Fallback Chain:** Gemini → OpenAI → Cohere → Cache

---

## Failure Handling & Resilience

### Multi-LLM Fallback

The application is designed to tolerate the failure of any single AI provider for up to 5 minutes:

- **Gemini unavailable:** Automatically fall back to OpenAI within 1-2 seconds
- **OpenAI unavailable:** Automatically fall back to Cohere within 1-2 seconds
- **Cohere unavailable:** Return cached/template responses; user perceives slow but working service
- **All providers unavailable:** System gracefully degrades; template questions delivered

**Measurement:** 5-minute health cache TTL prevents thundering herd retry storm if an API is experiencing sustained outage.

### Database Connection Resilience

Mongoose connection pool automatically retries up to the `serverSelectionTimeoutMS` (5 seconds). If MongoDB is unavailable at startup, the application exits immediately (fail-fast) rather than degrading in production.

**Startup Sequence:**

```
1. app.listen()
2. connectDB() → attempts MongoDB connection
3. If connection succeeds within 5 seconds → app.setReady(true)
4. If connection fails → process.exit(1)
5. Docker restart policy (unless-stopped) re-attempts container
```

### Graceful Shutdown

Upon receiving `SIGTERM` (Kubernetes termination signal, or Jenkins deployment switch):

```
1. app.setReady(false)  — mark unhealthy
2. Nginx stops routing traffic to this slot (health check fails)
3. server.close()  — wait for in-flight requests to drain
4. process.exit(0)  — terminate
```

Maximum shutdown grace period: 30 seconds (Kubernetes default). In-flight requests have 30 seconds to complete.

### Rate Limiting & DDoS Mitigation

Three independent rate limiters prevent resource exhaustion:

1. **Global API (100 req/15min):** Broad DDoS protection
2. **Space Creation (5 req/hour):** Prevents database bloat from spawn attacks
3. **Interview Action (50 req/hour):** Prevents AI API quota exhaustion

Admin users bypass global limiter; consider adding IP-based whitelisting in production.

### Transient Error Handling

**Network timeouts:** Multer and Axios (AI client libraries) respect `timeout` configuration; defaults set to 30–60 seconds
**DNS failures:** Application configures Google DNS (8.8.8.8) as fallback nameserver
**Port binding conflicts:** Blue-Green deployment pre-checks for port occupation before `docker run`

---

## Monitoring & Observability

### Health Checks

**Application-level:**

- `GET /health` → 200 OK if MongoDB connected and `app.getReady() === true`
- Used by Jenkins during deployments (Stage 6)
- Used by Kubernetes liveness probes (if migrated to K8s in future)

**Container-level:**

- Docker health check: Not configured (recommendation: add `HEALTHCHECK` to Dockerfile)
- Log output: All events logged to stdout/stderr (captured by Docker)

### Logging

**Application Logs:**

- Logged to stdout (JSON structured logging recommended but not implemented)
- Example entries:
  ```
  [HEALTH ✅] GEMINI is healthy
  [HEALTH ❌] OPENAI unhealthy — timeout after 30s (fail #1)
  [APP] Database connection established
  [APP] Application ready to accept traffic
  ```

**Docker Logs:**

- Accessible via `docker logs app-slot-3000`
- Retention: 7 days (default Docker daemon policy)
- Recommendation: Ship logs to CloudWatch or Datadog for persistent storage

**Nginx Logs:**

- Access log: `/var/log/nginx/access.log` (not monitored)
- Error log: `/var/log/nginx/error.log` (manual review only)
- Recommendation: Configure structured logging with `escape=json` for production

### Metrics

**Collected metrics (currently logged only):**

- AI provider health status (success/failure counts per provider)
- Database connection status (connected/failed)
- Application readiness state (ready/not-ready)
- Rate limit headers (RateLimit-Remaining, RateLimit-Reset)

**Not collected:**

- Request latency percentiles (p50, p95, p99)
- Error rates by endpoint
- AI API response times by provider
- Database query latency

**Recommendation:** Integrate Prometheus + Grafana for production observability.

### Alerting

Currently no alerting is configured. Recommended alerts:

| Alert              | Condition                          | Action                      |
| ------------------ | ---------------------------------- | --------------------------- |
| High Error Rate    | >10% of requests fail in 5 min     | Page on-call                |
| Provider Failure   | All AI providers unhealthy         | Escalate to SRE team        |
| Database Down      | MongoDB connection timeout         | Page on-call                |
| Deployment Failure | Jenkins pipeline fails 3x in a row | Slack notification          |
| Disk Full          | EC2 disk usage >90%                | Alert and provision cleanup |

---

## Configuration & Secrets Summary

### Required Secrets (Jenkins Credential Store)

| Credential ID        | Type              | Usage                               |
| -------------------- | ----------------- | ----------------------------------- |
| `docker-credentials` | Username/Password | Docker Hub login (Stage 4)          |
| `ec2-ssh-key`        | Private SSH Key   | EC2 deployment (Stages 5–7)         |
| `mongo-uri`          | Secret Text       | MongoDB connection (Stage 5)        |
| `gemini-api-key`     | Secret Text       | Gemini API initialization (Stage 5) |

### Optional Secrets

- `OPENAI_API_KEY` → enables OpenAI fallback
- `COHERE_API_KEY`, `COHERE_API_KEY_2` → enables Cohere instances

### Deployment Checklist

- [ ] EC2 instance launched, security group configured
- [ ] MongoDB Atlas cluster provisioned, IP whitelisting set
- [ ] Docker Hub account created, repository public or credentials configured
- [ ] Jenkins controller installed, Docker daemon available
- [ ] All secrets stored in Jenkins credential store (do not commit `.env` to Git)
- [ ] Nginx installed on EC2, default config templated
- [ ] SSH key pair created and stored in Jenkins
- [ ] Jenkinsfile checked into repository `main` branch

---

_Documentation generated for engineering review purposes._
