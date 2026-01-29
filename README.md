# Komuchi

> Audio upload → Transcript → Debrief card

A production-grade monorepo for building audio transcription and debrief generation.

## Tech Stack

- **Monorepo**: Turborepo + pnpm workspaces
- **Web App**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **API**: Fastify + TypeScript + Prisma
- **Database**: PostgreSQL
- **Storage**: S3-compatible (AWS S3, Cloudflare R2, MinIO)
- **Queue**: BullMQ + Redis
- **AI**: OpenAI (Whisper + GPT-4o), Deepgram
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
│   └── api/                 # Fastify backend
│       ├── prisma/
│       │   ├── schema.prisma # Database schema
│       │   └── seed.ts       # Seed data
│       ├── src/
│       │   ├── lib/          # Database, S3, Redis, AI
│       │   ├── queues/       # BullMQ queues & workers
│       │   ├── routes/       # API routes
│       │   ├── services/     # Business logic
│       │   ├── server.ts     # API server entry
│       │   └── worker.ts     # Worker process entry
│       └── package.json
├── packages/
│   ├── shared/              # Shared schemas & types
│   │   └── src/
│   │       ├── schemas/     # Zod schemas
│   │       └── types/       # TypeScript types
│   └── ui/                  # Component library
│       └── src/
│           ├── components/  # React components
│           └── utils/       # Utilities (cn, etc.)
├── turbo.json               # Turborepo config
├── pnpm-workspace.yaml      # Workspace config
└── package.json             # Root package.json
```

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- PostgreSQL >= 15
- Redis >= 7
- S3-compatible storage (AWS S3, Cloudflare R2, or MinIO)
- OpenAI API key

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up PostgreSQL

```bash
createdb komuchi_dev
```

### 3. Set up Redis

**Option A: Docker**
```bash
docker run -p 6379:6379 redis:7-alpine
```

**Option B: Upstash (serverless)**
Create a Redis database at https://upstash.com and get the connection URL.

### 4. Set up S3 Storage

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

Because the browser uploads audio **directly** to S3 using a presigned **PUT** URL, your bucket must allow cross‑origin `PUT` from your web app origin.

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

**S3‑compatible storage (R2/MinIO)**

Configure CORS on your bucket/service with the same intent:

- Allow origins: your dev/prod web origins
- Allow methods: `PUT`, `GET`, `HEAD`
- Allow headers: `Content-Type` (or `*`)
- Expose headers: `ETag` (optional, but useful)

### 5. Set up environment variables

Create `.env` in `apps/api/`:

```bash
# Database
DATABASE_URL="postgresql://localhost:5432/komuchi_dev"

# API Configuration
API_PORT=3001
API_HOST=0.0.0.0
CORS_ORIGIN=http://localhost:3000
NODE_ENV=development

# Redis (for BullMQ job queue)
REDIS_URL="redis://localhost:6379"

# S3-compatible Storage
S3_BUCKET=komuchi-audio
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
# S3_ENDPOINT=http://localhost:9000  # For MinIO/R2

# AI Services
OPENAI_API_KEY=sk-your-openai-key

# Transcription Provider: 'openai' (default) or 'deepgram'
TRANSCRIPTION_PROVIDER=openai
# DEEPGRAM_API_KEY=your-deepgram-key  # If using Deepgram

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000

# Upload Limits
MAX_UPLOAD_SIZE_MB=500

# Optional: enable server-side ffmpeg transcoding for MediaRecorder formats (webm/ogg)
# If enabled, the worker will download + convert to WAV 16k mono before transcription.
ENABLE_FFMPEG_TRANSCODE=false

# Error Tracking (optional)
# SENTRY_DSN=https://your-dsn@sentry.io/project

# Observability (optional)
OTEL_ENABLED=false
# OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

### 6. Set up the database

```bash
pnpm --filter=@komuchi/api db:generate
pnpm --filter=@komuchi/api db:migrate
pnpm --filter=@komuchi/api db:seed  # Optional
```

### 7. Build shared packages

```bash
pnpm build --filter=@komuchi/shared --filter=@komuchi/ui
```

### 8. Run development servers

```bash
# Terminal 1: API server
pnpm --filter=@komuchi/api dev

# Terminal 2: Worker process (job queue)
pnpm --filter=@komuchi/api dev:worker

# Terminal 3: Web app
pnpm --filter=@komuchi/web dev
```

Or run everything:
```bash
pnpm dev  # Runs web + api (start worker separately)
```

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
│       │                    ├── OpenAI Whisper API                │
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

- **Retries**: 3 attempts with exponential backoff (5s → 10s → 20s)
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

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/recordings` | Create recording, get presigned upload URL |
| `POST` | `/api/recordings/:id/complete-upload` | Mark upload complete, start processing |
| `GET` | `/api/recordings` | List user's recordings |
| `GET` | `/api/recordings/:id` | Get recording details |
| `GET` | `/api/recordings/:id?include=all` | Get recording with transcript & debrief |
| `GET` | `/api/recordings/:id/download-url` | Get presigned download URL |
| `GET` | `/api/recordings/:id/jobs` | Get processing jobs for recording |
| `POST` | `/api/recordings/:id/retry-debrief` | Retry failed debrief generation |

### Health & Observability

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Liveness probe (always returns 200 if server is running) |
| `GET` | `/api/ready` | Readiness probe (checks DB + Redis connections) |
| `GET` | `/api/health/detailed` | Detailed health info (requires token in production) |

## Available Scripts

### Root Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all apps and packages |
| `pnpm lint` | Run ESLint across all packages |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm clean` | Clean all build outputs |

### API Scripts

| Command | Description |
|---------|-------------|
| `pnpm --filter=@komuchi/api dev` | Start API server |
| `pnpm --filter=@komuchi/api dev:worker` | Start job worker |
| `pnpm --filter=@komuchi/api db:migrate` | Run migrations |
| `pnpm --filter=@komuchi/api db:seed` | Seed database |
| `pnpm --filter=@komuchi/api db:studio` | Open Prisma Studio |

## Development URLs

- **Web App**: http://localhost:3000
- **API**: http://localhost:3001
- **Health Check**: http://localhost:3001/api/health
- **Readiness Check**: http://localhost:3001/api/ready
- **Prisma Studio**: http://localhost:5555
- **MinIO Console**: http://localhost:9001

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

## Package Dependencies

```
@komuchi/api
  ├── @prisma/client
  ├── @aws-sdk/client-s3
  ├── bullmq + ioredis
  ├── openai + @deepgram/sdk
  ├── @sentry/node
  ├── @opentelemetry/sdk-node
  ├── @fastify/rate-limit
  └── @komuchi/shared

@komuchi/web
  ├── @komuchi/shared
  └── @komuchi/ui

@komuchi/shared
  └── zod
```

## License

Private - All rights reserved

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

### Docker notes

If you containerize `apps/api` workers, ensure ffmpeg is installed in the worker image (example for Debian-based images):

```bash
apt-get update && apt-get install -y ffmpeg
```
