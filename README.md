# AI Mock Interview Platform  
### DevOps Implementation | CI/CD | Containerized Deployment

A **DevOps-driven deployment architecture** for the AI Mock Interview Platform demonstrating modern DevOps engineering practices including:

- Continuous Integration & Continuous Deployment
- Containerized application deployment
- Infrastructure configuration
- Automated pipelines
- Multi-environment deployment

This project showcases how a full-stack application can be deployed using **GitHub, Jenkins, Docker, Apache, and Linux infrastructure**.

---

# DevOps Architecture Overview

This implementation demonstrates a **production-style DevOps architecture** where the application lifecycle is automated from **code commit to deployment**.

Key capabilities implemented:

• CI/CD pipeline automation  
• Containerized deployment with Docker  
• Multi-environment deployments  
• Automated build and deployment pipelines  
• Secure server configuration  
• Logging and monitoring setup  

📌 **View Architecture Diagram**

➡️ [Click here to view the Deployment Infrastructure Diagram](docs/deployment-infrastructure.png)

---

# DevOps Pipeline Overview

The project implements a **fully automated CI/CD pipeline**.

Developer changes trigger an automated workflow that builds, tests, and deploys the application using containerized infrastructure.

📌 **Pipeline Overview Diagram**

➡️ [Click here to view the DevOps Pipeline](docs/devops-pipeline.png)

---

# CI/CD Workflow

The CI/CD workflow automates the process from **code push to application deployment**.

📌 **Workflow Diagram**

➡️ [Click here to view the CI/CD Workflow](docs/cicd-workflow.png)

### Pipeline Flow

```
Developer Push Code
        ↓
GitHub Repository
        ↓
Webhook Trigger
        ↓
Jenkins CI/CD Pipeline
        ↓
Build Docker Image
        ↓
Docker Compose Deployment
        ↓
Application Running
```

---

# Branching Strategy

A **controlled Git branching strategy** ensures stable production deployments.

Two primary branches are maintained:

| Branch | Purpose |
|------|------|
| develop | Development & staging environment |
| main | Production deployment |

📌 **Branch Strategy Diagram**

➡️ [Click here to view the Git Branching Strategy](docs/git-branching-strategy.png)

### Development Workflow

```
Feature Development → develop branch
        ↓
Testing & Bug Fixes
        ↓
Pull Request Review
        ↓
Merge to main branch
        ↓
Production Deployment
```

---

# CI/CD Deployment Logic

The Jenkins pipeline automatically deploys based on the branch type.

📌 **Pipeline Deployment Logic**

➡️ [Click here to view the Pipeline Deployment Flow](docs/pipeline-flow.png)

| Branch | Deployment |
|------|------|
| develop | Deploy to Staging Environment |
| main | Deploy to Production Environment |

---

# DevOps Toolchain

| Category | Technology |
|--------|--------|
| Version Control | Git |
| Repository Hosting | GitHub |
| CI/CD Automation | Jenkins |
| Containerization | Docker |
| Container Orchestration | Docker Compose |
| Web Server | Apache |
| Server Environment | Linux |
| Database | MongoDB |
| Automation | Bash Scripting |

---

# Infrastructure Architecture

The deployment infrastructure runs on a **Linux server** configured with containerized services.

### Infrastructure Components

| Component | Purpose |
|------|------|
| Apache | Reverse proxy server |
| Docker Engine | Container runtime |
| Docker Compose | Service orchestration |
| Node.js Container | Application runtime |
| MongoDB Container | Database service |
| Docker Volumes | Persistent storage |

---

# Containerized Deployment

The application is packaged as a **Docker container** to ensure consistency across environments.

### Docker Implementation

Features implemented:

• Multi-stage Docker build  
• Lightweight Node.js Alpine image  
• Secure container configuration  
• Environment variable management  
• Container networking configuration  

---

# Service Orchestration

Docker Compose orchestrates multiple services required by the application.

### Services

| Service | Description |
|------|------|
| Node.js App | Backend application runtime |
| MongoDB | Application database |

### Compose Features

• Service dependency configuration  
• Automatic container restart  
• Environment variable injection  
• Persistent data volumes  

---

# Logging & Monitoring

Operational visibility is ensured through logging mechanisms.

### Logs Configured

| Log Type | Purpose |
|------|------|
| Apache Access Logs | Request tracking |
| Apache Error Logs | Server errors |
| Application Logs | Runtime debugging |

Log rotation is configured to prevent disk usage overflow.

---

# Backup Strategy

A backup mechanism is implemented to protect database data.

Features:

• MongoDB persistent volumes  
• Scheduled database backups  
• Cron-based backup automation  

---

# Security Practices Implemented

Security measures applied to the infrastructure include:

• SSH key-based authentication  
• Firewall configuration  
• Restricted system permissions  
• Secure environment variable handling  

---

# Deployment Environments

The system supports **two deployment environments**.

| Environment | Branch | Purpose |
|------|------|------|
| Staging | develop | Testing and validation |
| Production | main | Live application deployment |

---

# Repository Structure

```
.
├── src/
├── public/
├── Dockerfile
├── docker-compose.yml
├── docker-compose.prod.yml
├── Jenkinsfile
├── server.js
├── main.js
├── package.json
├── .env-example
├── .dockerignore
└── docs/
    ├── deployment-infrastructure.png
    ├── git-branching-strategy.png
    ├── cicd-workflow.png
    ├── devops-pipeline.png
    └── pipeline-flow.png
```

---

# End-to-End DevOps Workflow

```
Developer
   │
   ▼
GitHub Repository
   │
   ▼
Jenkins CI/CD Pipeline
   │
   ▼
Docker Image Build
   │
   ▼
Docker Compose Deployment
   │
   ▼
Linux Server Infrastructure
   │
   ▼
Apache Reverse Proxy
   │
   ▼
Application + MongoDB Containers
```

---

# Key DevOps Achievements

• Implemented automated **CI/CD pipeline using Jenkins**  
• Containerized full application using **Docker**  
• Designed **branch-based deployment automation**  
• Configured **Linux server infrastructure**  
• Implemented **Docker Compose orchestration**  
• Integrated **GitHub webhook automation**  
• Implemented **logging and monitoring practices**

---

# Author

**Ketan Ayatti**  
DevOps Intern  

GitHub Repository  
https://github.com/ketanayatti/ai-mock-interview

---

# DevOps Focus

This repository demonstrates practical experience with:

```
CI/CD
Docker
Linux Infrastructure
Jenkins Automation
Production Deployment
DevOps Pipeline Architecture
```

---
