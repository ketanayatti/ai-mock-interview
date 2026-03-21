# 🎯 AI Mock Interview Platform

> **Sharpen your interview skills with AI-powered adaptive questioning, real-time feedback, and comprehensive performance analytics.**

[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Docker](https://img.shields.io/badge/Docker-Containerized-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![Jenkins](https://img.shields.io/badge/Jenkins-CI%2FCD-D24939?style=flat-square&logo=jenkins&logoColor=white)](https://www.jenkins.io/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![Status](https://img.shields.io/badge/Status-Active%20Development-brightgreen?style=flat-square)]()

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Getting Started](#-getting-started)
- [Configuration](#-configuration)
- [API Reference](#-api-reference)
- [DevOps & CI/CD](#-devops--cicd)
- [Project Structure](#-project-structure)
- [Roadmap](#-roadmap)
- [Team](#-team)

---

## 🌟 Overview

The **AI Mock Interview Platform** is a web-based application designed to help job candidates practice and refine their interview skills through AI-powered mock interviews. It leverages **Google Gemini** as the primary AI engine (with OpenAI and Cohere as optional fallbacks) to generate adaptive questions, evaluate responses, and deliver comprehensive performance analytics.

The platform is built on a modern containerized architecture, deployed via a fully automated **Jenkins CI/CD pipeline**, and supports two live environments — **Staging** and **Production**.

### Key Highlights

- 🤖 **Multi-AI Engine** — Google Gemini primary, with OpenAI & Cohere fallback support
- 🔄 **Adaptive Questioning** — dynamically calibrates difficulty based on experience level and conversation history
- 📄 **Resume-Aware** — parses PDF/DOCX resumes to generate role-specific questions
- 📊 **Analytics Dashboard** — tracks scores, trends, and performance across sessions
- 🚀 **Production-Ready** — containerized with Docker, auto-deployed via Jenkins pipelines
- 🔒 **Secure by Design** — rate limiting, session encryption, non-root containers, file sanitization

---

## ✨ Features

### 🔐 Session Management

- Anonymous sessions with unique 8-character hex identifiers
- Cookie-based persistence (30-day expiry) — no signup required
- Session recovery using unique identifiers
- Multi-space support within a single session

### 🗂️ Interview Spaces

- Create spaces for specific companies and job roles
- Set experience level: **Fresher**, **Intermediate**, or **Experienced**
- Upload job descriptions for context-aware question generation
- Multiple round types: **HR**, **Technical**, **Final**, or custom
- Round-wise status tracking and summarization

### 📋 Resume Management

- Supports **PDF** and **DOCX** formats (up to 10MB)
- Automatic text extraction and AI-powered summarization
- Secure storage with filename sanitization (prevents directory traversal)

### 🤖 Adaptive Question Generation

| Experience Level | Questions per Round |
| ---------------- | ------------------- |
| Fresher          | 10                  |
| Intermediate     | 12                  |
| Experienced      | 15                  |

- Round-specific guidelines (HR → soft skills, Technical → domain expertise)
- Conversation history analysis for coherent follow-up questions
- Gemini-primary with graceful fallback mechanisms

### 📈 Performance Evaluation & Analytics

- Round-wise scoring and summary generation
- Multi-model evaluation pipeline
- Score trend visualization across sessions
- Space-level historical comparison
- Session duration and engagement tracking

---

## 🛠️ Tech Stack

| Category             | Technology                                    |
| -------------------- | --------------------------------------------- |
| **Runtime**          | Node.js 20+                                   |
| **Framework**        | Express.js                                    |
| **Templating**       | EJS (Server-Side Rendering)                   |
| **Database**         | MongoDB 7 + Mongoose ODM                      |
| **Primary AI**       | Google Gemini (`@google/genai`)               |
| **Optional AI**      | OpenAI API, Cohere API                        |
| **File Uploads**     | Multer                                        |
| **File Parsing**     | pdf-parse, Mammoth (DOCX)                     |
| **Security**         | DOMPurify, JSDOM, cookie-session, CORS        |
| **Containerization** | Docker (Node.js 20 Alpine, multi-stage build) |
| **Orchestration**    | Docker Compose                                |
| **CI/CD**            | Jenkins (Multi-branch Pipeline)               |
| **Web Server**       | Apache (Reverse Proxy)                        |
| **Version Control**  | Git + GitHub                                  |
| **Scripting**        | Bash                                          |

---

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                      │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTPS
┌───────────────────────▼─────────────────────────────────┐
│              Apache Reverse Proxy                        │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│           Node.js Application Container (:3000)          │
│   ┌──────────────┐  ┌───────────┐  ┌─────────────────┐  │
│   │  Express.js  │  │  EJS Views│  │  AI Integration │  │
│   │  Controllers │  │  (UI/UX)  │  │ Gemini/OpenAI   │  │
│   └──────────────┘  └───────────┘  └─────────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│           MongoDB Container (:27017)                     │
│       Sessions │ Spaces │ Questions/Answers              │
│              [Persistent Docker Volume]                  │
└─────────────────────────────────────────────────────────┘
```

### Three-Tier Architecture

- **Presentation Layer** — EJS server-rendered templates with Bootstrap/custom CSS
- **Business Logic Layer** — Express.js controllers and middleware
- **Data Access Layer** — Mongoose ODM with MongoDB document store

### Database Collections

```
Sessions ──────┐
               ├──► Spaces ──────┐
                                 ├──► Interview Rounds (embedded)
                                 ├──► Resume Data (embedded)
                                 └──► Q&A Records (referenced)
```

---

## 🚀 Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/)
- [Node.js 20+](https://nodejs.org/) (for local development without Docker)
- A [Google Gemini API Key](https://aistudio.google.com/)

### 1. Clone the Repository

```bash
git clone https://github.com/ketanayatti/ai-mock-interview.git
cd ai-mock-interview
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your credentials (see [Configuration](#-configuration)).

### 3. Run with Docker Compose

**Development mode** (with hot-reload via Nodemon):

```bash
docker-compose -f docker-compose.dev.yml up --build
```

**Production mode:**

```bash
docker-compose -f docker-compose.prod.yml up --build -d
```

The app will be available at `http://localhost:3000`.

### 4. Local Development (without Docker)

```bash
npm install
npm run dev       # starts with Nodemon
# or
npm start         # starts without auto-reload
```

> ⚠️ Requires a running MongoDB instance. Update `MONGO_URI` in `.env` accordingly.

---

## ⚙️ Configuration

### Required Environment Variables

| Variable         | Description                               |
| ---------------- | ----------------------------------------- |
| `MONGO_URI`      | MongoDB connection string                 |
| `GEMINI_API_KEY` | Google Gemini API key (primary AI engine) |
| `SESSION_SECRET` | Secret key for cookie-session encryption  |
| `NODE_ENV`       | `development` or `production`             |
| `PORT`           | HTTP server port (default: `3000`)        |

### Optional Variables

| Variable         | Description                                 |
| ---------------- | ------------------------------------------- |
| `OPENAI_API_KEY` | Enables OpenAI evaluation fallback          |
| `COHERE_API_KEY` | Enables Cohere evaluation fallback          |
| `EMAIL_USER`     | Email address for build/notification system |
| `EMAIL_PASS`     | Email password for SMTP                     |

### Environment Behavior

| Setting           | `development`   | `production`                 |
| ----------------- | --------------- | ---------------------------- |
| Logging           | Verbose / Debug | Errors only                  |
| Auto-reload       | Nodemon enabled | Disabled                     |
| Cookie security   | Standard        | HTTPOnly + Secure + SameSite |
| HTTPS enforcement | Off             | On                           |

---

## 📡 API Reference

### Session Endpoints

| Method | Endpoint           | Description                   |
| ------ | ------------------ | ----------------------------- |
| POST   | `/api/session`     | Create a new session          |
| GET    | `/api/session/:id` | Retrieve session by unique ID |
| GET    | `/api/sessions`    | List all sessions (dashboard) |

### Space Endpoints

| Method | Endpoint                | Description              |
| ------ | ----------------------- | ------------------------ |
| POST   | `/api/space`            | Create interview space   |
| GET    | `/api/space/:id`        | Get space details        |
| POST   | `/api/space/:id/resume` | Upload and parse resume  |
| GET    | `/api/space/:id/resume` | Download resume securely |

### Interview Endpoints

| Method | Endpoint                     | Description                       |
| ------ | ---------------------------- | --------------------------------- |
| POST   | `/api/interview/start`       | Initialize round & first question |
| POST   | `/api/interview/next`        | Submit answer & get next question |
| POST   | `/api/interview/complete`    | Complete round & generate summary |
| GET    | `/api/interview/:spaceId/qa` | Retrieve Q&A history              |

### Rate Limits

| Scope             | Limit                       |
| ----------------- | --------------------------- |
| General API       | 100 requests / 15 min / IP  |
| Space creation    | 5 spaces / hour / session   |
| Interview actions | 50 actions / hour / session |
| Admin users       | Exempt from all limits      |

---

## 🔧 DevOps & CI/CD

This project was implemented with a production-grade DevOps pipeline during an internship at **IonIdea**, prepared by **Ketan Ayatti** and **Virupaxappa Mirji**.

### CI/CD Pipeline Overview

```
Developer Push
     │
     ▼
GitHub Repository
     │
     ▼ (Webhook Trigger)
Jenkins CI/CD
     │
     ├─── develop branch ──► Build Staging Image ──► Deploy via Docker Compose ──► Staging Environment
     │
     └─── main branch ─────► Build Production Image ► Deploy via Docker Compose ──► Production Environment
                                                                      │
                                                              Send Email Notification
```

### Environments

| Environment | Branch    | Purpose                    |
| ----------- | --------- | -------------------------- |
| Staging     | `develop` | Testing and QA validation  |
| Production  | `main`    | Live production deployment |

### Git Branching Strategy

```
main    ●──────────────────────────────────●  (Production releases)
         \                                /
          \   Initial Commit             / Production Release
           \                           /
develop     ●──────●──────●───────────●  (Feature dev & staging)
                Feature  Bug Fix
```

**Branch Protection Rules (main):**

- Pull request required before merging
- Force push blocked
- Deletion restrictions applied
- Linear history enforcement

### Docker Configuration

**Multi-stage Dockerfile highlights:**

- Base: `node:20-alpine` (minimal footprint)
- Multi-stage build for reduced image size
- Non-root user execution for security hardening
- Health check for container orchestration

**Docker Compose Services:**

| Service   | Image          | Purpose             |
| --------- | -------------- | ------------------- |
| `app`     | Custom Node.js | Application runtime |
| `mongodb` | `mongo:7`      | Database service    |

**Volume management:**

- `mongo_data` — persistent MongoDB storage
- `resume_uploads` — persisted resume files

### Jenkins Pipeline Stages

| Stage               | Description                                |
| ------------------- | ------------------------------------------ |
| Prepare Environment | Inject credentials via Jenkins Credentials |
| Deploy Staging      | Triggered on `develop` branch push         |
| Deploy Production   | Triggered on merge to `main`               |
| Notify              | Send build status email to team            |

**Email notifications include:** Build status, Job name, Branch name, Build number, Build result.

### Server Infrastructure

| Component         | Role                      |
| ----------------- | ------------------------- |
| Apache            | Reverse proxy for the app |
| Docker            | Container runtime         |
| Docker Compose    | Service orchestration     |
| Node.js Container | Application runtime       |
| MongoDB Container | Database                  |
| Docker Volumes    | Persistent data storage   |

### Security Measures

- 🔥 Firewall configuration
- 🔑 SSH key-based authentication (no password login)
- 👤 Limited user privileges and role-based access
- 🐳 Non-root Docker container execution
- 🔒 Secrets managed via Jenkins Credentials Manager

---

## 📁 Project Structure

```
ai-mock-interview/
├── controllers/          # Express route controllers
├── models/               # Mongoose schemas (Session, Space, QA)
├── routes/               # API route definitions
├── views/                # EJS templates (UI pages)
├── public/               # Static assets (CSS, JS, images)
├── middleware/           # Auth, rate limiting, upload handling
├── utils/                # AI integrations, file parsers, helpers
├── uploads/              # Persisted resume files (Docker volume)
├── Dockerfile            # Multi-stage production Docker build
├── docker-compose.dev.yml
├── docker-compose.prod.yml
├── Jenkinsfile           # Multi-branch CI/CD pipeline definition
├── .env.example          # Environment variable template
├── package.json
└── README.md
```

---

## 🗺️ Roadmap

### Short-term (1–3 months)

- [ ] Automated unit and integration test suites
- [ ] Structured logging and centralized monitoring
- [ ] Redis for distributed session management
- [ ] Email notification on interview completion

### Medium-term (3–6 months)

- [ ] Admin dashboard for analytics and user management
- [ ] Peer review and feedback mechanism
- [ ] WebSocket for real-time feedback
- [ ] Custom AI evaluation rubrics

### Long-term (6–12 months)

- [ ] Mobile application
- [ ] Video recording for mock interviews
- [ ] Advanced ML-based analytics
- [ ] Integration with recruitment platforms
- [ ] Microservices migration for scalability

---

## 👥 Team

| Role          | Name              |
| ------------- | ----------------- |
| DevOps Intern | Ketan Ayatti      |
| DevOps Intern | Virupaxappa Mirji |
| Organization  | IonIdea           |

---

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

<div align="center">
  <sub>Built with ❤️ at IonIdea · March 2026</sub>
</div>
