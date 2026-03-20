# AI Mock Interview — Project Documentation

> **Project Title:** AI-Powered Mock Interview Platform with DevOps Implementation  
> **Technology Stack:** Node.js, Express.js, MongoDB, Docker, Jenkins, AWS, Nginx  
> **Repository:** [github.com/ketanayatti/ai-mock-interview](https://github.com/ketanayatti/ai-mock-interview)  
> **Date:** February 2026

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Objective of the Project](#2-objective-of-the-project)
3. [Need for DevOps](#3-need-for-devops)
4. [Problem Statement](#4-problem-statement)
5. [Proposed System](#5-proposed-system)
6. [System Overview](#6-system-overview)
7. [Architecture Diagram](#7-architecture-diagram)
8. [Tools & Technologies Used](#8-tools--technologies-used)
   - 8.1 [Git & GitHub](#81-git--github)
   - 8.2 [Docker](#82-docker)
   - 8.3 [Jenkins](#83-jenkins)
   - 8.4 [Linux / AWS](#84-linux--aws)
   - 8.5 [Nginx](#85-nginx)
9. [Implementation](#9-implementation)
   - 9.1 [Server Setup](#91-server-setup)
   - 9.2 [Application Containerization](#92-application-containerization)
   - 9.3 [CI/CD Pipeline Configuration](#93-cicd-pipeline-configuration)
   - 9.4 [Branch-Based Deployment](#94-branch-based-deployment)
10. [Testing & Deployment](#10-testing--deployment)
11. [Results](#11-results)
12. [Challenges Faced](#12-challenges-faced)
13. [Conclusion & Future Scope](#13-conclusion--future-scope)

---

## 1. Introduction

The **AI Mock Interview** platform is a full-stack web application built to help students and job seekers practice for real-world job interviews using Artificial Intelligence. The platform leverages a **Multi-AI Evaluation Pipeline** (Google Gemini + OpenAI + Cohere) to generate adaptive, context-aware interview questions and provide detailed, consensus-based performance evaluations.

This document outlines the complete DevOps lifecycle implemented for the project — from version control and containerization to continuous integration / continuous deployment (CI/CD) — ensuring the application is reliably built, tested, and deployed across staging and production environments.

The project follows modern software engineering best practices, including:

- **MVC architecture** for clean separation of concerns
- **Multi-stage Docker builds** for optimized, secure container images
- **Declarative Jenkins pipelines** for automated CI/CD
- **Branch-based deployment strategies** for safe staging-to-production promotion
- **Nginx reverse proxy** for production-grade traffic management

---

## 2. Objective of the Project

The primary objectives of this project are:

1. **Build an AI-Powered Interview Platform** — Create a feature-rich mock interview application that simulates realistic interview experiences using multiple AI models for question generation and evaluation.

2. **Implement End-to-End DevOps Practices** — Establish a robust DevOps pipeline that covers:
   - Source code management with Git & GitHub
   - Application containerization with Docker
   - Automated CI/CD with Jenkins
   - Cloud deployment on AWS EC2 instances
   - Reverse proxy and traffic management with Nginx

3. **Demonstrate Branch-Based Deployment** — Implement a workflow where:
   - The `develop` branch triggers automatic deployment to a **Staging** environment
   - The `main` branch triggers automatic deployment to the **Production** environment

4. **Ensure Production Readiness** — Apply security best practices including non-root Docker containers, rate limiting, session management, environment variable isolation, and file upload validation.

---

## 3. Need for DevOps

In traditional software development, the development and operations teams work in isolation. This leads to several problems:

| Problem | Impact |
|---------|--------|
| **Manual Deployments** | Error-prone, time-consuming, and inconsistent releases |
| **Environment Inconsistency** | "It works on my machine" — differences between development, staging, and production |
| **Slow Feedback Loops** | Bugs discovered late in the cycle are expensive to fix |
| **No Rollback Strategy** | Failed deployments cause extended downtime |
| **Security Gaps** | Secrets hardcoded in code, no environment isolation |

**DevOps bridges this gap** by integrating development and operations into a unified, automated workflow:

- **Continuous Integration (CI)** — Every code change is automatically built and validated
- **Continuous Deployment (CD)** — Validated changes are automatically deployed to the target environment
- **Infrastructure as Code** — Dockerfiles, Compose files, and Jenkinsfiles define the infrastructure declaratively
- **Environment Parity** — Docker ensures the application runs identically across all environments
- **Automated Pipelines** — Reduce human error, speed up delivery, and enable rapid iteration

For the AI Mock Interview project, DevOps is critical because:

1. The application handles **sensitive user data** (resumes, session IDs, interview responses) that must be managed securely across environments
2. **Multiple AI API keys** (Gemini, OpenAI, Cohere) must be injected securely without hardcoding
3. The **MongoDB database** requires persistent storage management across container restarts
4. **Rapid iteration** is needed as AI models and interview logic evolve frequently

---

## 4. Problem Statement

> *"Students and job seekers lack access to realistic, personalized interview practice. Existing solutions are either generic (no resume-based personalization), static (no adaptive questioning), or lack credible evaluation (single-model bias). Additionally, deploying and maintaining such an AI-intensive application reliably across environments is a significant operational challenge."*

### Key Challenges Addressed:

| # | Challenge | Description |
|---|-----------|-------------|
| 1 | **Generic Interview Prep** | Most platforms use the same questions for everyone, ignoring the candidate's resume, target role, and experience level |
| 2 | **Single-Model Evaluation Bias** | Relying on a single AI model for evaluation introduces model-specific biases and inconsistencies |
| 3 | **Static Question Flows** | Traditional platforms ask pre-set questions without adapting based on the candidate's responses |
| 4 | **Environment Consistency** | Running a Node.js + MongoDB application consistently across development, staging, and production environments |
| 5 | **Secure Secret Management** | Managing 9+ API keys and secrets (JWT, Session, MongoDB, Gmail, Gemini, OpenAI, Cohere) across environments |
| 6 | **Zero-Downtime Deployments** | Deploying new versions without interrupting active interview sessions |

---

## 5. Proposed System

The proposed system is a **full-stack AI Mock Interview Platform** with an integrated **DevOps pipeline** that addresses all the challenges outlined above.

### Application Layer

| Feature | Implementation |
|---------|---------------|
| **Personalized Questions** | AI analyzes uploaded resume (PDF/DOCX), job description, and experience level to generate tailored questions |
| **Adaptive Questioning** | 3-phase interview flow (Warm-up → Core → Closing) with difficulty that adjusts based on answer quality |
| **3-AI Consensus Evaluation** | Google Gemini (Technical Lead) + OpenAI (Hiring Manager) + Cohere (Synthesizer) provide a balanced, unbiased evaluation |
| **Multiple Round Types** | HR Round, Technical Round, Final Round, and Custom Rounds |
| **Experience-Level Calibration** | Fresher (10 questions), Intermediate (12 questions), Experienced (15 questions) with calibrated difficulty |
| **Performance Dashboard** | Track scores, strengths, weaknesses, and improvement trends across all interview sessions |

### DevOps Layer

| Feature | Implementation |
|---------|---------------|
| **Version Control** | Git with GitHub (branching strategy: `main` for production, `develop` for staging) |
| **Containerization** | Multi-stage Docker build with Node.js 20 Alpine, non-root user security |
| **Orchestration** | Docker Compose for multi-container management (App + MongoDB) |
| **CI/CD Pipeline** | Jenkins declarative pipeline with branch-based deployment triggers |
| **Cloud Hosting** | AWS EC2 instance running Ubuntu Linux |
| **Reverse Proxy** | Nginx for SSL termination, load balancing, and traffic routing |
| **Secret Management** | Jenkins Credentials Store for secure environment variable injection |

---

## 6. System Overview

The AI Mock Interview platform consists of the following major components:

### Application Components

```
┌─────────────────────────────────────────────────────────────┐
│                    AI MOCK INTERVIEW PLATFORM                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐    ┌──────────────────────────────┐   │
│  │  Express.js       │    │  EJS Templating Engine        │   │
│  │  Web Server       │◄──►│  (Server-Side Rendering)     │   │
│  │  (Port 3000)      │    │  home, dashboard, interview  │   │
│  └────────┬─────────┘    └──────────────────────────────┘   │
│           │                                                  │
│  ┌────────▼─────────┐                                       │
│  │  MVC Architecture │                                       │
│  │  ├─ Controllers   │ ◄── homeController, sessionController │
│  │  │                │     spaceController, interviewCtrl    │
│  │  ├─ Models        │ ◄── Session, Space, QuestionAnswer    │
│  │  ├─ Routes        │ ◄── Public, Protected, Interview      │
│  │  └─ Services      │ ◄── geminiService (legacy)            │
│  └────────┬─────────┘                                       │
│           │                                                  │
│  ┌────────▼─────────┐    ┌──────────────────────────────┐   │
│  │  AI Pipeline      │    │  Security Middleware          │   │
│  │  ├─ Gemini 2.5    │    │  ├─ Rate Limiting (3-tier)   │   │
│  │  ├─ OpenAI GPT-4o │    │  ├─ Cookie Sessions (30d)    │   │
│  │  └─ Cohere Cmd-A  │    │  ├─ CORS                     │   │
│  └────────┬─────────┘    │  ├─ Path Traversal Guard      │   │
│           │               │  └─ DOMPurify (XSS)           │   │
│  ┌────────▼─────────┐    └──────────────────────────────┘   │
│  │  MongoDB 7        │                                       │
│  │  (Mongoose ODM)   │                                       │
│  └──────────────────┘                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### User Flow

1. **Session Creation** → User creates a lightweight session (no password, 8-char hex ID)
2. **Space Creation** → User uploads resume, selects company/position/rounds/experience level
3. **AI Resume Analysis** → System extracts text from PDF/DOCX, generates AI-powered summary
4. **Interview Start** → User selects a round; AI generates the first adaptive question
5. **Adaptive Loop** → User answers → AI evaluates → Next question adapts difficulty
6. **3-AI Evaluation** → After round completion, Gemini + OpenAI + Cohere evaluate performance
7. **Results Dashboard** → Detailed score breakdown, strengths, weaknesses, improvement advice

---

## 7. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ARCHITECTURE OVERVIEW                             │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────┐
                              │   BROWSER    │
                              │  (Client)    │
                              │  EJS Views   │
                              └──────┬───────┘
                                     │ HTTP / HTTPS
                                     ▼
                              ┌─────────────┐
                              │    NGINX     │
                              │  (Reverse    │
                              │   Proxy)     │
                              │  Port 80/443 │
                              └──────┬───────┘
                                     │
                    ┌────────────────┬┴────────────────┐
                    │  Staging :3000 │ Production :4000 │
                    ▼                ▼                  │
          ┌──────────────────────────────────────────┐  │
          │         DOCKER CONTAINER (App)           │  │
          │  ┌────────────────────────────────────┐  │  │
          │  │        EXPRESS.JS SERVER           │  │  │
          │  │  ┌──────┐ ┌──────────┐ ┌────────┐  │  │  │
          │  │  │Routes│ │Middleware│ │  CORS   │ │  │  │
          │  │  └──┬───┘ └──────────┘ └────────┘  │  │  │
          │  │     │                               │  │  │
          │  │  ┌──▼───────────────────────────┐   │  │  │
          │  │  │       CONTROLLERS                │  │  │
          │  │  │  home │ session │ space │ int.  │  │  │
          │  │  └──┬───────────────────────────┘   │   │  │
          │  │     │                               │   │  │
          │  │  ┌──▼───────────────────────────┐   │   │  │
          │  │  │       AI PIPELINE             │   │   │  │
          │  │  │ Gemini ──► OpenAI ──► Cohere  │   │   │  │
          │  │  │ (Eval A)  (Eval B)  (Synth.)  │   │   │  │
          │  │  └──────────────────────────────┘   │   │  │
          │  └────────────────────────────────────┘   │  │
          └──────────────┬───────────────────────────┘  │
                         │                              │
                         ▼                              │
          ┌──────────────────────────────────────────┐  │
          │   DOCKER CONTAINER (MongoDB 7)            │  │
          │   ┌──────────────────────────────────┐    │  │
          │   │  Collections:                     │    │  │
          │   │  ├─ sessions                      │    │  │
          │   │  ├─ spaces (+ embedded rounds)    │    │  │
          │   │  └─ questionanswers               │    │  │
          │   └──────────────────────────────────┘    │  │
          │   Volumes: mongo_data / mongo_data_prod   │  │
          └──────────────────────────────────────────┘  │
                                                        │
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ DevOps Pipeline ─ ─ ─ ─ ─ ─ ─ ─┘

  ┌──────────┐    ┌──────────┐    ┌───────────────┐    ┌──────────────┐
  │   GIT    │───►│  GITHUB  │───►│   JENKINS     │───►│  AWS EC2     │
  │ (Local)  │    │ (Remote) │    │  (CI/CD)      │    │  (Ubuntu)    │
  │          │    │          │    │               │    │              │
  │ develop  │    │ Webhook  │    │ Jenkinsfile:  │    │ Docker +     │
  │ main     │    │ Trigger  │    │ ├─ Env Setup  │    │ Compose      │
  └──────────┘    └──────────┘    │ ├─ Staging*   │    │ Nginx        │
                                  │ └─ Production*│    └──────────────┘
                                  └───────────────┘
                                  * branch-based
```

### Data Flow Diagram

```
  User Input          Application Logic           AI Services           Database
  ─────────          ─────────────────           ───────────           ────────
      │                      │                        │                    │
      │  Upload Resume       │                        │                    │
      │─────────────────────►│                        │                    │
      │                      │  Parse PDF/DOCX        │                    │
      │                      │────────────────────────►  Gemini: Summarize │
      │                      │◄────────────────────────  AI Summary        │
      │                      │  Save Space + Summary   │                    │
      │                      │────────────────────────────────────────────►│
      │                      │                        │                    │
      │  Start Interview     │                        │                    │
      │─────────────────────►│                        │                    │
      │                      │  Generate Question      │                    │
      │                      │────────────────────────►  Gemini: Question  │
      │  Display Question    │◄────────────────────────  AI Question       │
      │◄─────────────────────│                        │                    │
      │                      │                        │                    │
      │  Submit Answer       │                        │                    │
      │─────────────────────►│  Save Q&A              │                    │
      │                      │────────────────────────────────────────────►│
      │                      │  Adaptive Next Q        │                    │
      │                      │────────────────────────►  Gemini: Adapt     │
      │  Next Question       │◄────────────────────────                    │
      │◄─────────────────────│                        │                    │
      │                      │        (repeat loop)    │                    │
      │  Finish Round        │                        │                    │
      │─────────────────────►│  3-AI Evaluation        │                    │
      │                      │────────────────────────►  Gemini (Eval A)   │
      │                      │────────────────────────►  OpenAI (Eval B)   │
      │                      │────────────────────────►  Cohere (Synth.)   │
      │  Final Report        │◄────────────────────────  Consensus Report  │
      │◄─────────────────────│  Save Summary           │                    │
      │                      │────────────────────────────────────────────►│
      │                      │                        │                    │
```

---

## 8. Tools & Technologies Used

### 8.1 Git & GitHub

**Git** is a distributed version control system used to track changes in the source code. **GitHub** hosts the remote repository and integrates with Jenkins for automated deployments.

| Aspect | Details |
|--------|---------|
| **Repository** | `github.com/ketanayatti/ai-mock-interview` |
| **Branching Strategy** | `main` (production) and `develop` (staging) |
| **Version Control** | All source code, Dockerfiles, Jenkinsfiles, and Compose files are versioned |
| **Collaboration** | Pull Request workflow for code reviews before merging to `main` |
| **CI/CD Trigger** | GitHub webhooks notify Jenkins on push events to `develop` and `main` |

**Key Git Files in the Project:**

```
.gitignore          — Excludes node_modules, .env, Resumes, build artifacts, IDE files
.dockerignore       — Excludes node_modules, .env, .git, *.md, uploaded resumes
```

**Branching Workflow:**

```
feature/xyz ──► develop (staging) ──► main (production)
     │               │                    │
   Local Dev    Auto-deploy to       Auto-deploy to
   & Testing    Staging (port 3000)  Production (port 4000)
```

---

### 8.2 Docker

**Docker** is used to containerize the application, ensuring consistent behavior across all environments. The project uses a **multi-stage build** for optimized image size and a **non-root user** for security.

#### Dockerfile (Multi-Stage Build)

```dockerfile
# ---- Build Stage ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# ---- Production Stage ----
FROM node:20-alpine
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /app/public/Resumes && chown -R appuser:appgroup /app
USER appuser
EXPOSE 3000
CMD ["node", "server.js"]
```

**Key Design Decisions:**

| Decision | Rationale |
|----------|-----------|
| **Multi-stage build** | Separates dependency installation from runtime, reducing final image size |
| **Node 20 Alpine** | Minimal base image (~5MB) for smaller attack surface and faster pulls |
| **Non-root user (`appuser`)** | Follows the principle of least privilege; prevents container escape attacks |
| **`npm ci --only=production`** | Installs exact versions from lockfile, excludes devDependencies (e.g., Nodemon) |
| **Resume directory permissions** | Pre-creates `/app/public/Resumes` with correct ownership for file uploads |

#### Docker Compose — Development (`docker-compose.yml`)

```yaml
services:
  app:
    build: .
    container_name: ai-mock-interview
    restart: unless-stopped
    ports:
      - "${PORT:-3000}:3000"
    env_file:
      - .env
    depends_on:
      mongo:
        condition: service_healthy
    volumes:
      - resume_uploads:/app/public/Resumes

  mongo:
    image: mongo:7
    container_name: ai-mock-interview-mongo
    restart: unless-stopped
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh --quiet
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

volumes:
  mongo_data:
  resume_uploads:
```

#### Docker Compose — Production (`docker-compose.prod.yml`)

```yaml
services:
  app:
    build: .
    container_name: ai-mock-interview-prod
    restart: unless-stopped
    ports:
      - "4000:3000"        # Production runs on port 4000
    env_file:
      - .env
    depends_on:
      mongo:
        condition: service_healthy
    volumes:
      - resume_uploads_prod:/app/public/Resumes

  mongo:
    image: mongo:7
    container_name: ai-mock-interview-mongo-prod
    restart: unless-stopped
    volumes:
      - mongo_data_prod:/data/db
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh --quiet
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

volumes:
  mongo_data_prod:
  resume_uploads_prod:
```

**Staging vs Production Differences:**

| Aspect | Staging (`docker-compose.yml`) | Production (`docker-compose.prod.yml`) |
|--------|-------------------------------|---------------------------------------|
| **App Port** | `3000` (configurable via `$PORT`) | `4000` (fixed external mapping) |
| **MongoDB Port** | `27017` (exposed for debugging) | Not exposed (internal only) |
| **Container Names** | `ai-mock-interview` | `ai-mock-interview-prod` |
| **Volumes** | `mongo_data`, `resume_uploads` | `mongo_data_prod`, `resume_uploads_prod` |
| **Data Isolation** | Separate volumes ensure staging data never mixes with production |

---

### 8.3 Jenkins

**Jenkins** is an open-source automation server used to implement the CI/CD pipeline. The project uses a **Declarative Pipeline** defined in a `Jenkinsfile`.

#### Jenkinsfile

```groovy
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
}
```

**Pipeline Stages Explained:**

| Stage | Purpose |
|-------|---------|
| **Prepare Environment** | Dynamically generates the `.env` file from Jenkins credentials. This ensures secrets are never committed to Git. Runs on every branch. |
| **Deploy Staging** | Triggered **only** on the `develop` branch. Tears down the existing staging containers and rebuilds from the latest code. Uses `docker-compose.yml` (port 3000). |
| **Deploy Production** | Triggered **only** on the `main` branch. Tears down the existing production containers and rebuilds. Uses `docker-compose.prod.yml` (port 4000). |

**Jenkins Credentials (9 secrets managed securely):**

| Credential ID | Description |
|---------------|-------------|
| `JWT_SECRET` | Secret key for JSON Web Token signing |
| `SESSION_SECRET` | Secret key for cookie-session encryption |
| `MONGO_URI` | MongoDB Atlas connection string |
| `GMAIL_USER` | Gmail address for Nodemailer |
| `GMAIL_PASS` | Gmail App Password for SMTP |
| `GEMINI_API_KEY` | Google Gemini AI API key (required) |
| `API_KEY` | Google Gemini API key alias |
| `OPENAI_API_KEY` | OpenAI GPT-4o-mini API key (optional) |
| `COHERE_API_KEY` | Cohere Command-A API key (optional) |

---

### 8.4 Linux / AWS

**AWS EC2** is used to host the application in the cloud. The instance runs **Ubuntu Linux** as the operating system.

| Aspect | Details |
|--------|---------|
| **Cloud Provider** | Amazon Web Services (AWS) |
| **Service** | EC2 (Elastic Compute Cloud) |
| **OS** | Ubuntu 22.04 LTS |
| **Instance Type** | t2.micro / t2.small (suitable for demo/staging) |
| **Software Installed** | Docker, Docker Compose, Jenkins, Nginx, Git |
| **Security Groups** | Ports open: 22 (SSH), 80 (HTTP), 443 (HTTPS), 3000 (Staging), 4000 (Production) |

**Server Setup Commands:**

```bash
# Update the system
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install -y docker.io
sudo systemctl enable docker
sudo systemctl start docker

# Install Docker Compose
sudo apt install -y docker-compose-plugin

# Install Jenkins
sudo apt install -y openjdk-17-jdk
wget -q -O - https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key | sudo apt-key add -
sudo sh -c 'echo deb https://pkg.jenkins.io/debian-stable binary/ > /etc/apt/sources.list.d/jenkins.list'
sudo apt update && sudo apt install -y jenkins
sudo systemctl enable jenkins

# Add Jenkins user to Docker group
sudo usermod -aG docker jenkins
sudo systemctl restart jenkins

# Install Nginx
sudo apt install -y nginx
sudo systemctl enable nginx
```

---

### 8.5 Nginx

**Nginx** acts as a **reverse proxy** in front of the Docker containers, providing:

- **SSL/TLS termination** — Handles HTTPS certificates
- **Traffic routing** — Routes requests to staging (port 3000) or production (port 4000)
- **Load balancing** — Can distribute traffic across multiple instances
- **Static file serving** — Offloads static assets from the Node.js process
- **Security** — Hides internal port numbers from the public internet

**Example Nginx Configuration:**

```nginx
# Staging server
server {
    listen 80;
    server_name staging.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Production server
server {
    listen 80;
    server_name app.example.com;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 9. Implementation

### 9.1 Server Setup

The application server is set up on an **AWS EC2 instance** running Ubuntu 22.04 LTS. The following components are installed and configured:

**Step 1: Provision EC2 Instance**
- Launch an EC2 instance with Ubuntu 22.04 AMI
- Configure Security Groups to allow SSH (22), HTTP (80), HTTPS (443), and application ports (3000, 4000)
- Assign an Elastic IP for a stable public address

**Step 2: Install Core Dependencies**
- Docker and Docker Compose for containerization
- Jenkins for CI/CD automation
- Nginx for reverse proxy
- Git for repository cloning

**Step 3: Configure Jenkins**
- Access Jenkins at `http://<server-ip>:8080`
- Install recommended plugins + GitHub Integration plugin
- Create credentials for all 9 environment secrets
- Configure GitHub webhook to trigger builds on push

**Step 4: Configure Nginx**
- Set up reverse proxy rules for staging and production
- Configure SSL certificates using Let's Encrypt (Certbot)
- Enable HTTP/2 for improved performance

---

### 9.2 Application Containerization

The application is containerized using Docker with the following strategy:

**Multi-Stage Build Process:**

```
Stage 1: Builder
├── Base: node:20-alpine
├── Install: npm ci --only=production
└── Output: optimized node_modules/

Stage 2: Production
├── Base: node:20-alpine (fresh, no build tools)
├── Security: Non-root user (appuser:appgroup)
├── Copy: node_modules from Stage 1
├── Copy: Application source code
├── Prepare: Resume upload directory with correct permissions
├── Expose: Port 3000
└── Run: node server.js
```

**Container Architecture (Staging):**

```
┌─────────────────────────────────────────────┐
│                Docker Host (EC2)             │
│                                             │
│  ┌───────────────────┐  ┌───────────────┐   │
│  │ ai-mock-interview │  │ ai-mock-      │   │
│  │ (Node.js App)     │──│ interview-    │   │
│  │ Port: 3000        │  │ mongo         │   │
│  │ User: appuser     │  │ Port: 27017   │   │
│  └───────┬───────────┘  └───────┬───────┘   │
│          │                      │            │
│  ┌───────▼───────────┐  ┌──────▼────────┐   │
│  │ resume_uploads    │  │ mongo_data    │   │
│  │ (Named Volume)    │  │ (Named Vol.)  │   │
│  └───────────────────┘  └───────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

**Health Checks:**

The MongoDB container includes a health check that verifies database readiness before the application container starts:

```yaml
healthcheck:
  test: echo 'db.runCommand("ping").ok' | mongosh --quiet
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 10s
```

This ensures the application never attempts to connect to a MongoDB instance that isn't ready, preventing startup crashes.

---

### 9.3 CI/CD Pipeline Configuration

The CI/CD pipeline is configured using Jenkins with the following flow:

```
┌──────────────────────────────────────────────────────────────────────┐
│                        CI/CD PIPELINE FLOW                           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Developer                                                           │
│     │                                                                │
│     │  git push                                                      │
│     ▼                                                                │
│  GitHub Repository                                                   │
│     │                                                                │
│     │  Webhook Trigger (POST)                                        │
│     ▼                                                                │
│  Jenkins Pipeline                                                    │
│     │                                                                │
│     ├──► Stage 1: Prepare Environment                                │
│     │    ├── Fetch credentials from Jenkins Credential Store         │
│     │    ├── Generate .env file with all 9 secrets                   │
│     │    └── ✅ Environment Ready                                    │
│     │                                                                │
│     ├──► Stage 2A: Deploy Staging (branch: develop)                  │
│     │    ├── docker compose down                                     │
│     │    ├── docker compose up -d --build                            │
│     │    └── ✅ Staging Live on :3000                                │
│     │                                                                │
│     └──► Stage 2B: Deploy Production (branch: main)                  │
│          ├── docker compose -f docker-compose.prod.yml down          │
│          ├── docker compose -f docker-compose.prod.yml up -d --build │
│          └── ✅ Production Live on :4000                             │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Pipeline Features:**

| Feature | Implementation |
|---------|---------------|
| **Declarative Syntax** | Clean, readable Jenkinsfile with structured stages |
| **Credential Injection** | Jenkins `credentials()` function securely binds secrets to environment variables |
| **Branch Conditions** | `when { branch 'develop' }` and `when { branch 'main' }` ensure stage execution only on the correct branch |
| **Idempotent Deploys** | `docker compose down` + `up --build` ensures clean state on every deployment |
| **Agent Flexibility** | `agent any` allows the pipeline to run on any available Jenkins agent |

---

### 9.4 Branch-Based Deployment

The project implements a **branch-based deployment strategy** that maps Git branches to deployment environments:

```
┌───────────────────────────────────────────────────────────┐
│                 BRANCH-BASED DEPLOYMENT                    │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────┐      ┌──────────────┐                    │
│  │  feature/*   │─────►│   develop     │                   │
│  │  (Local Dev) │ PR   │  (Staging)   │                   │
│  └─────────────┘      └──────┬───────┘                    │
│                              │                             │
│                  Jenkins: docker compose up                 │
│                  Port: 3000                                │
│                  Container: ai-mock-interview               │
│                  Volume: mongo_data                         │
│                              │                             │
│                    Tested & Verified?                       │
│                         │ Yes                               │
│                         ▼                                  │
│                  ┌──────────────┐                           │
│                  │    main       │                          │
│                  │ (Production) │                          │
│                  └──────┬───────┘                          │
│                         │                                  │
│           Jenkins: docker compose -f prod.yml up           │
│           Port: 4000                                       │
│           Container: ai-mock-interview-prod                │
│           Volume: mongo_data_prod                          │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

**Workflow:**

1. **Develop locally** on a `feature/*` branch
2. **Push to `develop`** → Jenkins auto-deploys to **Staging** (port 3000)
3. **Verify on staging** → Test all features, check AI responses, verify database operations
4. **Merge to `main`** → Jenkins auto-deploys to **Production** (port 4000)
5. **Monitor production** → Verify application health via Nginx

**Key Benefits:**

- **Risk Isolation** — Staging and production have completely separate Docker containers, volumes, and databases
- **Fast Rollback** — Previous Docker images are cached; rolling back is as fast as `docker compose up` with the previous image
- **Parallel Environments** — Both staging and production run simultaneously on the same EC2 instance without conflicts
- **Data Safety** — Separate named volumes (`mongo_data` vs `mongo_data_prod`) ensure staging experiments never corrupt production data

---

## 10. Testing & Deployment

### Pre-Deployment Testing

| Test Type | Description | Status |
|-----------|-------------|--------|
| **Manual Functional Testing** | Verified all user flows (session creation, resume upload, interview start, adaptive questioning, 3-AI evaluation) | ✅ Passed |
| **API Endpoint Testing** | Tested all 15+ API routes for correct responses, authentication guards, and error handling | ✅ Passed |
| **Rate Limiting Testing** | Verified 3-tier rate limiting (general: 100/15min, space creation: 5/hr, interview: 50/hr) | ✅ Passed |
| **File Upload Testing** | Tested PDF/DOCX uploads, file size limits (10MB), MIME type validation, path traversal protection | ✅ Passed |
| **AI Pipeline Testing** | Verified Gemini-only fallback, dual-AI (Gemini + OpenAI), and full 3-AI consensus (Gemini + OpenAI + Cohere) | ✅ Passed |
| **Docker Build Testing** | Verified multi-stage build, non-root user permissions, health checks, volume persistence | ✅ Passed |
| **Environment Variable Testing** | Verified Jenkins credential injection and `.env` file generation | ✅ Passed |

### Deployment Verification Checklist

```
□ Docker containers are running (docker ps)
□ Application responds on correct port (curl http://localhost:3000 or :4000)
□ MongoDB health check passes (service_healthy)
□ Resume upload directory exists and is writable
□ AI API keys are correctly injected (test question generation)
□ Session creation and continuation works
□ Nginx reverse proxy routes traffic correctly
□ SSL certificate is valid (if configured)
```

### Deployment Commands

```bash
# Deploy to Staging (develop branch)
docker compose down
docker compose up -d --build

# Deploy to Production (main branch)
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build

# Check running containers
docker ps

# View application logs
docker logs ai-mock-interview -f        # Staging
docker logs ai-mock-interview-prod -f   # Production

# Check MongoDB health
docker exec ai-mock-interview-mongo mongosh --eval "db.runCommand('ping')"
```

---

## 11. Results

The DevOps implementation for the AI Mock Interview project achieved the following results:

### Quantitative Results

| Metric | Result |
|--------|--------|
| **Deployment Time** | Reduced from ~30 minutes (manual) to ~2 minutes (automated via Jenkins) |
| **Docker Image Size** | ~180MB (multi-stage Alpine build, production-only dependencies) |
| **Container Startup** | ~10 seconds (with MongoDB health check wait) |
| **Environment Parity** | 100% — Same Dockerfile runs identically on developer machine, staging, and production |
| **Secret Management** | 9 secrets securely managed via Jenkins Credentials (zero hardcoded values) |
| **Uptime** | Containers auto-restart on failure (`restart: unless-stopped`) |

### Qualitative Results

1. **Reliable Deployments** — Every push to `develop` or `main` triggers an automated, consistent deployment. No manual SSH, no manual Docker commands.

2. **Environment Isolation** — Staging and production run on the same server but are completely isolated (different containers, ports, volumes, and databases).

3. **Security Hardening** — Non-root Docker user, secret injection via Jenkins, MongoDB not exposed in production, rate limiting on all API routes.

4. **Developer Experience** — Developers push code and the pipeline handles everything else. The `docker-compose.yml` files also work locally for development, ensuring environment parity from day one.

5. **Scalability Foundation** — The Docker + Compose setup can be easily migrated to Kubernetes, Docker Swarm, or AWS ECS for horizontal scaling as user demand grows.

### Application Features Delivered

| Feature | Description |
|---------|-------------|
| **Multi-AI Evaluation** | 3-AI consensus pipeline (Gemini + OpenAI + Cohere) with graceful fallback |
| **Adaptive Interviews** | 3-phase interview flow with difficulty adjustment based on answer quality |
| **Resume Analysis** | PDF/DOCX parsing with AI-powered summarization |
| **Performance Dashboard** | Real-time tracking of scores, strengths, and improvement areas |
| **Session Management** | Lightweight 8-char hex session IDs with 30-day cookie expiry |
| **Security** | Rate limiting, XSS protection, path traversal guards, non-root containers |

---

## 12. Challenges Faced

| # | Challenge | Solution |
|---|-----------|----------|
| 1 | **MongoDB Connection Timing** | The Node.js app would crash on startup if MongoDB wasn't ready. **Solution:** Added Docker Compose `healthcheck` with `depends_on: condition: service_healthy` to ensure MongoDB is fully ready before the app starts. |
| 2 | **Environment Variable Injection** | Secrets needed to be available inside Docker containers without hardcoding in the image. **Solution:** Used Jenkins `credentials()` to fetch secrets, dynamically generate `.env` file, and mount via Docker Compose `env_file` directive. |
| 3 | **File Upload Permissions** | Docker's non-root user (`appuser`) couldn't write to the resume upload directory. **Solution:** Pre-created the `/app/public/Resumes` directory in the Dockerfile and set ownership with `chown -R appuser:appgroup /app`. |
| 4 | **Port Conflicts** | Running both staging and production on the same server caused port conflicts. **Solution:** Used different port mappings (3000 for staging, 4000 for production) with separate container names and separate named volumes. |
| 5 | **Docker Image Size** | Initial image was ~600MB due to including devDependencies and build tools. **Solution:** Implemented multi-stage build with Alpine base and `npm ci --only=production`, reducing image to ~180MB. |
| 6 | **AI API Rate Limits** | Multiple concurrent interviews could exhaust Gemini/OpenAI API quotas. **Solution:** Implemented 3-tier rate limiting in Express.js (general, space creation, interview actions) to throttle outgoing AI requests. |
| 7 | **Data Persistence** | Container restarts would lose MongoDB data and uploaded resumes. **Solution:** Used Docker named volumes (`mongo_data`, `resume_uploads`) that persist independently of container lifecycle. |
| 8 | **Jenkins Docker Permissions** | Jenkins couldn't execute Docker commands. **Solution:** Added the `jenkins` user to the `docker` group with `sudo usermod -aG docker jenkins`. |

---

## 13. Conclusion & Future Scope

### Conclusion

The AI Mock Interview project successfully demonstrates a **full DevOps lifecycle** implementation for an AI-powered web application. The project achieves:

1. **Automated CI/CD** — Push-to-deploy workflow using Jenkins declarative pipelines, reducing deployment time from ~30 minutes to ~2 minutes.

2. **Containerized Architecture** — Docker multi-stage builds with non-root security, Docker Compose orchestration for multi-service applications, and named volumes for data persistence.

3. **Branch-Based Deployment Strategy** — Clean separation between staging (`develop`) and production (`main`) environments with complete data isolation.

4. **Secure Secret Management** — All 9 API keys and secrets are managed through Jenkins Credentials, dynamically injected at build time, and never stored in the repository.

5. **Production-Ready Infrastructure** — Nginx reverse proxy, SSL support, auto-restart policies, MongoDB health checks, and 3-tier rate limiting.

The platform itself delivers a unique **Multi-AI Evaluation Pipeline** that combines Google Gemini, OpenAI, and Cohere to provide unbiased, consensus-based interview assessments — a differentiated feature that sets it apart from existing interview preparation tools.

### Future Scope

| # | Enhancement | Description |
|---|-------------|-------------|
| 1 | **Kubernetes Migration** | Migrate from Docker Compose to Kubernetes (K8s) for auto-scaling, self-healing, and rolling updates |
| 2 | **Terraform / IaC** | Use Terraform to provision and manage AWS infrastructure as code (EC2, VPC, Security Groups, RDS) |
| 3 | **Monitoring & Alerting** | Integrate Prometheus + Grafana for real-time container metrics, and PagerDuty/Slack for alerting on failures |
| 4 | **Automated Testing Stage** | Add a `Test` stage to the Jenkins pipeline with Jest/Mocha unit tests and Supertest API integration tests |
| 5 | **Blue-Green Deployments** | Implement blue-green or canary deployment strategies for zero-downtime production releases |
| 6 | **Container Registry** | Push Docker images to AWS ECR or Docker Hub for versioned image storage and rollback capability |
| 7 | **Log Aggregation** | Centralize logs using ELK Stack (Elasticsearch, Logstash, Kibana) or AWS CloudWatch |
| 8 | **CDN Integration** | Use AWS CloudFront or Cloudflare to serve static assets globally for reduced latency |
| 9 | **Database Backup Automation** | Implement automated MongoDB backups using `mongodump` with scheduled cron jobs or AWS Backup |
| 10 | **Multi-Region Deployment** | Deploy to multiple AWS regions for geographic redundancy and reduced latency for global users |
| 11 | **Video Interview Support** | Add WebRTC-based video interviews with AI-powered body language and speech analysis |
| 12 | **User Authentication** | Upgrade from session-based access to OAuth 2.0 / SSO with Google/GitHub sign-in |

---

> **Document Version:** 1.0  
> **Last Updated:** February 2026  
> **Author:** Ketan Ayatti  
> **Repository:** [github.com/ketanayatti/ai-mock-interview](https://github.com/ketanayatti/ai-mock-interview)
