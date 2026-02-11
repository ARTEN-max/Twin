# Quick Start Guide

Get the application running in **5 minutes** or less!

## Option 1: Docker (Recommended - Easiest)

Perfect for getting started quickly. Everything runs in containers.

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

### Steps

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd Twin-main

# 2. Copy environment file (optional - defaults work)
cp apps/api/.env.example apps/api/.env

# 3. Start everything
docker compose up --build
```

That's it! 🎉

The app will be available at:
- **Web App**: http://localhost:3000
- **API**: http://localhost:3001
- **MinIO Console**: http://localhost:9001 (login: `minioadmin` / `minioadmin`)
- **Diarization Service**: http://localhost:8001

### What's Running?

- ✅ Web app (Next.js)
- ✅ API server (Fastify)
- ✅ Worker process (job queue)
- ✅ Redis (job queue backend)
- ✅ MinIO (S3-compatible storage)
- ✅ Diarization service (Python FastAPI for speaker identification)

All services use **mock AI providers** by default, so no API keys needed!

**Note**: The diarization service will download a ~2GB model on first run (takes a few minutes). This is cached for future runs.

---

## Option 2: Local Development (For Active Development)

Better for active development with hot reloading.

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Redis (or use Docker for Redis only)
- MinIO (or use Docker for MinIO only)

### Steps

```bash
# 1. Clone and install
git clone <your-repo-url>
cd Twin-main
pnpm install

# 2. Set up environment
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env if needed (defaults work for local dev)

# 3. Start infrastructure services (using Docker)
docker compose up redis minio minio-init diarization -d

# 4. Set up database
pnpm --filter=@komuchi/api db:generate
pnpm --filter=@komuchi/api db:push

# 5. Build shared packages
pnpm build --filter=@komuchi/shared --filter=@komuchi/ui

# 6. Start services (in separate terminals)
# Terminal 1: API
pnpm --filter=@komuchi/api dev

# Terminal 2: Worker
pnpm --filter=@komuchi/api dev:worker

# Terminal 3: Web App
pnpm --filter=@komuchi/web dev
```

---

## Using Real AI Providers

To use OpenAI or Deepgram instead of mocks:

1. Edit `apps/api/.env`:
   ```bash
   TRANSCRIPTION_PROVIDER=openai
   DEBRIEF_PROVIDER=openai
   OPENAI_API_KEY=sk-your-key-here
   ```

2. Restart the services

---

## Troubleshooting

### Port Already in Use

If ports 3000, 3001, 6379, or 9000 are already in use:

- **Docker**: Stop other containers using those ports
- **Local**: Change ports in `.env` or stop other services

### Database Errors

```bash
# Reset the database
pnpm --filter=@komuchi/api db:reset
pnpm --filter=@komuchi/api db:push
```

### Redis Connection Issues

Make sure Redis is running:
```bash
# Check if Redis is running
docker ps | grep redis

# Or start Redis manually
docker run -p 6379:6379 redis:7-alpine
```

### MinIO Connection Issues

Make sure MinIO is running:
```bash
# Check if MinIO is running
docker ps | grep minio

# Or start MinIO manually
docker run -p 9000:9000 -p 9001:9001 \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin" \
  minio/minio server /data --console-address ":9001"
```

---

## Next Steps

- Read the full [README.md](./README.md) for detailed documentation
- Check [TESTING.md](./TESTING.md) for testing guidelines
- Explore the API endpoints at http://localhost:3001/api/health

Happy coding! 🚀
