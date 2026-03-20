# AI Mock Interview Platform

AI-powered mock interview platform with resume-based personalization, adaptive questioning, and multi-model performance evaluation.

This README is both:
- a development handbook (run locally, understand architecture, debug), and
- a DevOps runbook (container deployment, Jenkins CI/CD, branch release flow).

## Table of Contents
- [Product Overview](#product-overview)
- [Core Features](#core-features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Docker Deployment](#docker-deployment)
- [CI/CD with Jenkins](#cicd-with-jenkins)
- [Branching and Release Strategy](#branching-and-release-strategy)
- [API Endpoints](#api-endpoints)
- [Security Controls](#security-controls)
- [Operations Runbook](#operations-runbook)
- [Troubleshooting](#troubleshooting)
- [Known Gaps and Roadmap](#known-gaps-and-roadmap)

## Product Overview

The platform helps candidates practice realistic interview rounds by using:
- resume parsing (PDF/DOCX),
- AI-generated interview questions adapted to candidate level,
- round-by-round evaluation summaries, and
- performance analytics across sessions.

It uses server-rendered EJS pages and MongoDB persistence, with Docker and Jenkins for deployment automation.

## Core Features

- Session-based access with generated unique IDs (no full auth flow required).
- Interview space creation by company, job role, rounds, and experience level.
- Resume upload and text extraction:
  - PDF via `pdf-parse`
  - DOCX via `mammoth`
- Resume-to-role summary generation using Gemini.
- Adaptive interview engine:
  - `fresher`: 10 questions
  - `intermediate`: 12 questions
  - `experienced`: 15 questions
- Multi-AI evaluation pipeline for summaries:
  - Gemini (required, primary)
  - OpenAI (optional)
  - Cohere (optional)
- Performance dashboard with score trend and round-wise analytics.
- Resume download flow with path traversal protection.

## Tech Stack

### Application
- Node.js 20+
- Express 4
- EJS
- MongoDB 7 + Mongoose

### AI Integrations
- Google Gemini (`@google/genai`) - required
- OpenAI (`openai`) - optional
- Cohere (`cohere-ai`) - optional

### Security and Middleware
- `cookie-session`
- `express-rate-limit`
- `cors`
- `multer`
- `dompurify` + `jsdom`

### DevOps
- Docker (multi-stage image)
- Docker Compose (dev and prod files)
- Jenkins declarative pipeline

## Architecture

### High-Level Flow

```text
Browser (EJS Views)
   -> Express Routes/Controllers
   -> AI Services (Gemini/OpenAI/Cohere)
   -> MongoDB (Session/Space/Q&A)
```

### Runtime Components
- Web app container: Node.js app on internal port `3000`
- DB container: MongoDB 7
- Named volumes:
  - Mongo data persistence
  - resume upload persistence

### Diagrams
- Deployment architecture: `docs/deployment-infrastructure.png`
- DevOps pipeline: `docs/devops-pipeline.png`
- CI/CD workflow: `docs/cicd-workflow.png`
- Branching strategy: `docs/git-branching-strategy.png`
- Pipeline flow: `docs/pipeline-flow.png`

## Project Structure

```text
.
├── server.js
├── package.json
├── Dockerfile
├── docker-compose.yml
├── docker-compose.prod.yml
├── Jenkinsfile
├── .env-example
├── public/
│   ├── css/
│   └── Resumes/
├── src/
│   ├── app.js
│   ├── routes.js
│   ├── config/
│   │   ├── aiServices.js
│   │   ├── dbConfig.js
│   │   └── email.js
│   ├── controllers/
│   │   ├── sessionController.js
│   │   ├── spaceController.js
│   │   └── interviewController.js
│   ├── models/
│   │   ├── sessionModel.js
│   │   ├── spaceModel.js
│   │   └── questionAnswerModel.js
│   └── views/
└── docs/
```

## Environment Variables

Use `.env-example` as baseline.

### Required
- `PORT` (default `3000`)
- `NODE_ENV` (`development` or `production`)
- `SESSION_SECRET`
- `MONGO_URI`
- `GEMINI_API_KEY`

### Optional (feature-enhancing)
- `OPENAI_API_KEY`
- `COHERE_API_KEY`

### Optional (email)
- `GMAIL_USER`
- `GMAIL_PASS`

### Present for compatibility
- `JWT_SECRET`
- `API_KEY`

## Local Development

### Prerequisites
- Node.js 20+
- npm 10+
- MongoDB running (local or Atlas)

### Setup

```bash
cp .env-example .env
npm install
npm run dev
```

App URL: `http://localhost:3000`

### Available Scripts
- `npm run dev` - starts `nodemon server.js`
- `npm start` - starts `node server.js`
- `npm test` - placeholder script (currently not implemented)

## Docker Deployment

### Why Docker Here
- predictable runtime across environments
- image-level dependency packaging
- easier staging/prod parity

### Image Details
- multi-stage build (`node:20-alpine`)
- production dependencies only
- non-root runtime user (`appuser`)

### Development Compose

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

Exposed:
- app: `${PORT:-3000}:3000`
- mongo: `27017:27017`

Tear down:

```bash
docker compose down
```

### Production Compose

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f app
```

Exposed:
- app: `4000:3000`
- mongo: not externally published

Tear down:

```bash
docker compose -f docker-compose.prod.yml down
```

## CI/CD with Jenkins

The Jenkins pipeline is branch-aware and deploys via Docker Compose.

### Pipeline Stages
1. Prepare `.env` from Jenkins credentials.
2. Deploy staging when branch is `develop`.
3. Deploy production when branch is `main`.
4. Send build notification email in post actions.

### Required Jenkins Credentials
- `JWT_SECRET`
- `SESSION_SECRET`
- `MONGO_URI`
- `GMAIL_USER`
- `GMAIL_PASS`
- `GEMINI_API_KEY`
- `API_KEY`
- `OPENAI_API_KEY`
- `COHERE_API_KEY`

### Deployment Mapping
- `develop` -> `docker-compose.yml` -> staging
- `main` -> `docker-compose.prod.yml` -> production

### Jenkins Agent Requirements
- Docker Engine + Compose plugin/CLI available
- permission to run Docker commands
- outbound network access to AI providers and MongoDB endpoint

## Branching and Release Strategy

### Branches
- `develop`: active integration and staging deploy
- `main`: production deploy

### Recommended Flow
1. Create feature branch from `develop`.
2. Open PR into `develop`.
3. Validate on staging deployment.
4. Promote to `main` for production release.

## API Endpoints

### Session and Entry
- `GET /`
- `GET /welcome`
- `POST /api/start-new`
- `POST /api/continue-session`

### Profile and Dashboard (protected)
- `GET /dashboard`
- `GET /profile`
- `POST /update-profile`
- `GET /performance`

### Interview Space (protected)
- `POST /spaces/create`
- `GET /space/:id`
- `GET /space/resume/download/:id`

### Interview Engine (protected)
- `GET /space/:spaceId/round/:roundName/start`
- `GET /generate-questions/:spaceId/:roundName`
- `POST /next-question/:spaceId/:roundName`
- `POST /finish-round/:spaceId/:roundName`
- `GET /api/questions-answers/:roundId`
- `GET /api/performance-insights`

## Security Controls

- Cookie session hardening:
  - `httpOnly: true`
  - `sameSite: 'lax'`
  - secure flag in production
- Request rate limiting:
  - `/api/*`: 100 / 15 min
  - `/spaces/create`: 5 / hour
  - interview actions: 50 / hour
- Upload restrictions:
  - only PDF and DOCX
  - max size 10 MB
- Path traversal protection for resume download.
- Server-side sanitization for rendered markdown content.
- Container security: non-root runtime user.

## Operations Runbook

### Health Verification

```bash
docker compose ps
docker compose logs --tail=100 app
docker compose logs --tail=100 mongo
```

### Rebuild and Restart

```bash
docker compose down
docker compose up -d --build
```

### Mongo Backup (example)

```bash
docker exec ai-mock-interview-mongo mongodump --archive=/tmp/backup.archive
docker cp ai-mock-interview-mongo:/tmp/backup.archive ./backup.archive
```

### Mongo Restore (example)

```bash
docker cp ./backup.archive ai-mock-interview-mongo:/tmp/backup.archive
docker exec ai-mock-interview-mongo mongorestore --archive=/tmp/backup.archive --drop
```

## Troubleshooting

### App cannot connect to MongoDB
- Verify `MONGO_URI` value in `.env`.
- Ensure Mongo service is healthy (`docker compose ps`).
- Check Mongo logs for auth/network errors.

### AI features fail
- Ensure `GEMINI_API_KEY` is valid.
- If OpenAI/Cohere are absent, app should continue with Gemini-only path.
- Check app logs for model/provider errors.

### Upload fails
- Confirm file type is PDF or DOCX.
- Confirm file size <= 10 MB.
- Verify write permission for `public/Resumes` or mounted volume.

### Jenkins deployment fails
- Confirm all Jenkins credentials exist with exact IDs.
- Confirm Docker is installed and usable by Jenkins user.
- Confirm correct branch conditions (`develop` and `main`).

## Known Gaps and Roadmap

- Automated tests are not yet implemented (`npm test` is placeholder).
- Pipeline currently deploys directly without a dedicated test stage.
- Consider adding:
  - lint/test stage before deploy,
  - container image tagging and registry push,
  - rollback strategy,
  - observability stack (metrics + alerting),
  - reverse proxy and TLS automation for production edge.

---

## Maintainer

Ketan Ayatti

Repository: `https://github.com/ketanayatti/ai-mock-interview`
