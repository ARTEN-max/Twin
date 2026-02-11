# TWIN

> Audio upload → Transcript → Debrief card

A production-grade monorepo for building audio transcription and debrief generation.

## Tech Stack

- **Monorepo**: Turborepo + pnpm workspaces
- **Web App**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **API**: Fastify + TypeScript + Prisma
- **Database**: SQLite (via Prisma)
- **Storage**: S3-compatible (AWS S3, Cloudflare R2, MinIO)
- **Queue**: BullMQ + Redis
- **AI**: OpenAI (GPT-4o), Deepgram, mock providers for local dev
- **Diarization**: Python service (Coqui TTS / WhoSpeaks)
- **Shared**: Zod schemas + TypeScript types
- **UI**: React component library
- **Observability**: OpenTelemetry, Sentry, Pino logging

## Project Structure

```
komuchi/
├── apps/
│   ├── web/                 # Next.js 14 frontend
│   │   ├── src/
│   │   │   └── app/         # App Router pages
│   │   └── package.json
│   ├── api/                 # Fastify backend
│   │   ├── prisma/
│   │   │   ├── schema.prisma # Database schema (SQLite)
│   │   │   └── seed.ts       # Seed data
│   │   ├── src/
│   │   │   ├── lib/          # Database, S3, Redis, AI
│   │   │   ├── queues/       # BullMQ queues & workers
│   │   │   ├── routes/       # API routes
│   │   │   ├── services/     # Business logic
│   │   │   ├── server.ts     # API server entry
│   │   │   └── worker.ts     # Worker process entry
│   │   └── package.json
├── packages/
│   ├── shared/              # Shared schemas & types
│   │   └── src/
│   │       ├── schemas/     # Zod schemas
│   │       └── types/       # TypeScript types
│   └── ui/                  # Component library
│       └── src/
│           ├── components/  # React components
│           └── utils/       # Utilities (cn, etc.)
├── services/
│   └── diarization/         # Python speaker diarization service
│       ├── main.py
│       ├── Dockerfile
│       └── requirements.txt
├── docker-compose.yml       # Full-stack Docker setup
├── turbo.json               # Turborepo config
├── pnpm-workspace.yaml      # Workspace config
└── package.json             # Root package.json
```

## Quick Start

> **New to the project?** Check out [QUICKSTART.md](./QUICKSTART.md) for a step-by-step guide!

### Quick Start with Docker

The fastest way to get the full stack running. No need to install Node.js, Redis, or configure S3 — Docker handles everything.

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

### Steps

```bash
# 1. Clone the repo
git clone <repo-url>
cd Debrief

# 2. Copy the environment template (defaults work out of the box)
cp apps/api/.env.example apps/api/.env

# 3. Build and start all services
docker compose up --build
```

This starts six services:

| Service         | URL                   | Description                                                |
| --------------- | --------------------- | ---------------------------------------------------------- |
| **Web App**     | http://localhost:3000 | Next.js frontend                                           |
| **API**         | http://localhost:3001 | Fastify backend                                            |
| **Worker**      | _(background)_        | BullMQ job processor                                       |
| **Redis**       | localhost:6379        | Job queue                                                  |
| **MinIO**       | http://localhost:9001 | S3-compatible storage (login: `minioadmin` / `minioadmin`) |
| **Diarization** | http://localhost:8001 | Python FastAPI service for speaker identification          |

Database migrations run automatically on startup. The app uses mock AI providers by default so you don't need any API keys to get started.

**Note**: The diarization service will download a ~2GB model on first run (takes 2-5 minutes depending on your internet speed). This is cached in a Docker volume for future runs.

### Stopping

```bash
docker compose down          # Stop containers (data preserved in volumes)
docker compose down -v       # Stop and remove all data
```

### Rebuilding after code changes

```bash
docker compose up --build
```

### Hybrid mode (for active development)

Run infrastructure in Docker but apps locally for hot reloading:

```bash
# Start only Redis + MinIO
docker compose up redis minio minio-init

# In another terminal, run apps locally
pnpm install
pnpm dev
```

---

## Manual Setup (without Docker)

### Prerequisites

- Node.js >= 20.0.0 (see `.nvmrc`)
- pnpm >= 9.0.0
- Redis >= 7
- S3-compatible storage (AWS S3, Cloudflare R2, or MinIO)
- Rust toolchain (for desktop app only)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up Redis

**Option A: Docker**

```bash
docker run -p 6379:6379 redis:7-alpine
```

**Option B: Upstash (serverless)**
Create a Redis database at https://upstash.com and get the connection URL.

### 3. Set up S3 Storage

**Option A: AWS S3**

1. Create an S3 bucket
2. Create an IAM user with S3 access
3. Note the access key, secret, region, and bucket name

**Option B: Cloudflare R2**

1. Create an R2 bucket in Cloudflare dashboard
2. Create an API token with R2 permissions

**Option C: MinIO (local development)**

```bash
docker run -p 9000:9000 -p 9001:9001 \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin" \
  minio/minio server /data --console-address ":9001"
```

### S3 CORS (required for browser uploads)

Because the browser uploads audio **directly** to S3 using a presigned **PUT** URL, your bucket must allow cross-origin `PUT` from your web app origin.

- **Important**: The upload request must include a `Content-Type` header that matches the `mimeType` you sent to `POST /api/recordings` (the presigned URL enforces it).

**AWS S3 bucket CORS example**

Use this for development (localhost) and production (replace with your deployed web origin):

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://your-web-domain.com"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

**S3-compatible storage (R2/MinIO)**

Configure CORS on your bucket/service with the same intent:

- Allow origins: your dev/prod web origins
- Allow methods: `PUT`, `GET`, `HEAD`
- Allow headers: `Content-Type` (or `*`)
- Expose headers: `ETag` (optional, but useful)

### 4. Set up environment variables

Copy the template and edit as needed:

```bash
cp apps/api/.env.example apps/api/.env
```

The `.env.example` file contains all required variables with sensible defaults. For local development with Docker, you can use it as-is (it's configured for MinIO and mock AI providers).

Key variables to configure:

```bash
# Database (SQLite — works out of the box, no external DB needed)
DATABASE_URL="file:./dev.db"

# API Configuration
API_PORT=3001
API_HOST=0.0.0.0
CORS_ORIGIN=http://localhost:3000,http://localhost:5174
NODE_ENV=development

# Redis (for BullMQ job queue)
REDIS_URL="redis://localhost:6379"

# S3-compatible Storage
S3_BUCKET=komuchi-audio
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
# S3_ENDPOINT=http://localhost:9000  # For MinIO/R2

# AI Providers (defaults to "mock" — no API keys needed to get started)
TRANSCRIPTION_PROVIDER=mock    # Options: mock, openai, deepgram, whisper-local
DEBRIEF_PROVIDER=mock          # Options: mock, openai
# OPENAI_API_KEY=sk-your-key   # Required if using openai provider
# DEEPGRAM_API_KEY=your-key    # Required if using deepgram provider

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000

# Upload Limits
MAX_UPLOAD_SIZE_MB=500

# Optional: enable server-side ffmpeg transcoding for MediaRecorder formats (webm/ogg)
ENABLE_FFMPEG_TRANSCODE=false

# Diarization Service (optional)
# DIARIZATION_SERVICE_URL=http://localhost:8001

# Error Tracking (optional)
# SENTRY_DSN=https://your-dsn@sentry.io/project

# Observability (optional)
OTEL_ENABLED=false
# OTEL_SERVICE_NAME=komuchi-api
# OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

### 5. Set up the database

```bash
pnpm --filter=@komuchi/api db:generate
pnpm --filter=@komuchi/api db:migrate
pnpm --filter=@komuchi/api db:seed  # Optional
```

### 6. Build shared packages

```bash
pnpm build --filter=@komuchi/shared --filter=@komuchi/ui
```

### 7. Run development servers

```bash
# Terminal 1: API server
pnpm --filter=@komuchi/api dev

# Terminal 2: Worker process (job queue)
pnpm --filter=@komuchi/api dev:worker

# Terminal 3: Web app
pnpm --filter=@komuchi/web dev
```

Or run everything at once:

```bash
pnpm dev  # Runs web + api (start worker separately)
```

---

## Diarization Service

A standalone Python service at `services/diarization/` for speaker identification using Coqui TTS / WhoSpeaks.

### Running with Docker

```bash
cd services/diarization
docker build -t komuchi-diarization .
docker run -p 8001:8001 komuchi-diarization
```

See `services/diarization/README.md` for more details.

---

## Architecture

### Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                        Upload Flow                               │
├─────────────────────────────────────────────────────────────────┤
│  Client ──POST /recordings──> API ──presigned URL──> S3         │
│  Client ──PUT file──────────────────────────────────> S3         │
│  Client ──POST /complete-upload──> API                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Job Queue (BullMQ)                          │
├─────────────────────────────────────────────────────────────────┤
│  transcriptionQueue ──> Worker ──> transcribeAudio()            │
│       │                    │                                     │
│       │                    ├── Download from S3                  │
│       │                    ├── Transcription (OpenAI / Deepgram) │
│       │                    ├── Save transcript to DB             │
│       │                    └── Enqueue debrief job               │
│       │                                                          │
│       ▼                                                          │
│  debriefQueue ──────> Worker ──> generateDebrief()              │
│                           │                                      │
│                           ├── OpenAI GPT-4o (structured output)  │
│                           ├── Save debrief to DB                 │
│                           └── Mark recording complete            │
└─────────────────────────────────────────────────────────────────┘
```

### Job Queue Features

- **Retries**: 3 attempts with exponential backoff (starting at 5s)
- **Concurrency**: 2 jobs per worker
- **Rate limiting**: 10 jobs/minute
- **Status tracking**: Jobs update status in DB at each step
- **Progress**: Real-time progress updates (10%, 40%, 70%, 100%)
- **Error handling**: Failed jobs logged with error message

### Production Guardrails

- **Rate Limiting**: Per-user rate limiting with Redis backend (configurable via `RATE_LIMIT_MAX`)
- **Upload Size**: Configurable max upload size (default 500MB via `MAX_UPLOAD_SIZE_MB`)
- **Optional Transcoding**: If `ENABLE_FFMPEG_TRANSCODE=true`, the worker will transcode `audio/webm` / `audio/ogg` uploads to WAV (16kHz mono) via ffmpeg before transcription.
- **Env Validation**: Zod-validated environment configuration with fail-fast startup
- **Error Tracking**: Sentry integration for production error monitoring
- **Observability**: OpenTelemetry instrumentation (optional, enable with `OTEL_ENABLED=true`)
- **Structured Logging**: Pino-based request/response logging with sensitive data redaction
- **Health Checks**: Kubernetes-ready `/health` (liveness) and `/ready` (readiness) probes

## API Endpoints

### Recordings

| Method | Endpoint                                  | Description                                |
| ------ | ----------------------------------------- | ------------------------------------------ |
| `POST` | `/api/recordings`                         | Create recording, get presigned upload URL |
| `POST` | `/api/recordings/:id/complete-upload`     | Mark upload complete, start processing     |
| `POST` | `/api/recordings/:id/upload`              | Proxy upload endpoint                      |
| `GET`  | `/api/recordings`                         | List user's recordings                     |
| `GET`  | `/api/recordings/:id`                     | Get recording details                      |
| `GET`  | `/api/recordings/:id?include=all`         | Get recording with transcript & debrief    |
| `GET`  | `/api/recordings/:id/download-url`        | Get presigned download URL                 |
| `GET`  | `/api/recordings/:id/jobs`                | Get processing jobs for recording          |
| `POST` | `/api/recordings/:id/retry-debrief`       | Retry failed debrief generation            |
| `POST` | `/api/recordings/:id/retry-transcription` | Retry failed transcription                 |

### Voice Profile

| Method   | Endpoint                    | Description                                       |
| -------- | --------------------------- | ------------------------------------------------- |
| `POST`   | `/api/voice-profile/enroll` | Enroll a voice profile for speaker identification |
| `GET`    | `/api/voice-profile/status` | Check voice profile enrollment status             |
| `DELETE` | `/api/voice-profile`        | Delete voice profile                              |

### Health & Observability

| Method | Endpoint               | Description                                              |
| ------ | ---------------------- | -------------------------------------------------------- |
| `GET`  | `/api/health`          | Liveness probe (always returns 200 if server is running) |
| `GET`  | `/api/ready`           | Readiness probe (checks DB + Redis connections)          |
| `GET`  | `/api/health/detailed` | Detailed health info (requires token in production)      |

## Available Scripts

### Root Scripts

| Command              | Description                              |
| -------------------- | ---------------------------------------- |
| `pnpm dev`           | Start all apps in development mode       |
| `pnpm build`         | Build all apps and packages              |
| `pnpm lint`          | Run ESLint across all packages           |
| `pnpm lint:fix`      | Run ESLint with auto-fix                 |
| `pnpm format`        | Format all files with Prettier           |
| `pnpm format:check`  | Check formatting without changes         |
| `pnpm typecheck`     | Run TypeScript type checking             |
| `pnpm clean`         | Clean all build outputs and node_modules |
| `pnpm test`          | Run all tests                            |
| `pnpm test:coverage` | Run tests with coverage reports          |

### API Scripts

| Command                                      | Description                              |
| -------------------------------------------- | ---------------------------------------- |
| `pnpm --filter=@komuchi/api dev`             | Start API server (with hot reload)       |
| `pnpm --filter=@komuchi/api dev:worker`      | Start job worker (with hot reload)       |
| `pnpm --filter=@komuchi/api build`           | Generate Prisma client & build with tsup |
| `pnpm --filter=@komuchi/api start`           | Start production API server              |
| `pnpm --filter=@komuchi/api start:worker`    | Start production worker                  |
| `pnpm --filter=@komuchi/api test`            | Run tests                                |
| `pnpm --filter=@komuchi/api test:watch`      | Run tests in watch mode                  |
| `pnpm --filter=@komuchi/api test:coverage`   | Run tests with coverage                  |
| `pnpm --filter=@komuchi/api db:generate`     | Generate Prisma client                   |
| `pnpm --filter=@komuchi/api db:migrate`      | Run database migrations (dev)            |
| `pnpm --filter=@komuchi/api db:migrate:prod` | Deploy migrations (production)           |
| `pnpm --filter=@komuchi/api db:push`         | Push schema changes directly             |
| `pnpm --filter=@komuchi/api db:seed`         | Seed the database                        |
| `pnpm --filter=@komuchi/api db:studio`       | Open Prisma Studio GUI                   |
| `pnpm --filter=@komuchi/api db:reset`        | Reset database (destructive)             |

### Web App Scripts

| Command                            | Description                           |
| ---------------------------------- | ------------------------------------- |
| `pnpm --filter=@komuchi/web dev`   | Start Next.js dev server on port 3000 |
| `pnpm --filter=@komuchi/web build` | Build for production                  |
| `pnpm --filter=@komuchi/web start` | Start production server               |

## Development URLs

- **Web App**: http://localhost:3000
- **API**: http://localhost:3001
- **Health Check**: http://localhost:3001/api/health
- **Readiness Check**: http://localhost:3001/api/ready
- **Prisma Studio**: http://localhost:5555
- **MinIO Console**: http://localhost:9001
- **Diarization Service**: http://localhost:8001

## Database Schema

```
┌──────────┐     ┌─────────────┐     ┌────────────┐
│   User   │────<│  Recording  │────<│    Job     │
└──────────┘     └─────────────┘     └────────────┘
                        │
                        ├───────────────┐
                        │               │
                        ▼               ▼
                 ┌──────────┐    ┌─────────┐
                 │Transcript│    │ Debrief │
                 └──────────┘    └─────────┘

Recording Status Flow:
  pending → uploaded → processing → complete
                              └───→ failed
```

The database uses **SQLite** via Prisma. The `DATABASE_URL` defaults to `file:./dev.db` (relative to the Prisma schema directory). No external database server is required.

## Package Dependencies

```
@komuchi/api
  ├── @prisma/client         # Database ORM (SQLite)
  ├── @aws-sdk/client-s3     # S3 storage
  ├── bullmq + ioredis       # Job queue
  ├── openai + @deepgram/sdk # AI transcription & debriefs
  ├── @sentry/node           # Error tracking
  ├── @opentelemetry/sdk-node # Observability
  ├── @fastify/rate-limit    # Rate limiting
  └── @komuchi/shared        # Shared schemas

@komuchi/web
  ├── @tanstack/react-query  # Data fetching
  ├── zustand                # State management
  ├── react-markdown         # Markdown rendering
  ├── react-dropzone         # File uploads
  ├── lucide-react           # Icons
  ├── @komuchi/shared        # Shared schemas
  └── @komuchi/ui            # Component library

@komuchi/shared
  └── zod                    # Schema validation
```

## ffmpeg (optional, recommended for consistent transcription)

If you enable `ENABLE_FFMPEG_TRANSCODE=true`, **ffmpeg must be installed** and available on `PATH` for the **worker** process.

### Install locally (macOS)

```bash
brew install ffmpeg
```

### Install locally (Ubuntu/Debian)

```bash
sudo apt-get update && sudo apt-get install -y ffmpeg
```

## License

Private - All rights reserved
