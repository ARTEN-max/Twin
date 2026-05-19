# Twin

This repo contains the Twin iOS app, local API, worker, and supporting services. This is the only setup guide you need if you want to run the app locally in Xcode.

## Prerequisites

- macOS
- Xcode 16+ with iOS Simulator installed
- Node.js 20+
- `pnpm` 9+
- CocoaPods
- Docker Desktop

Verify the basics:

```bash
node -v
pnpm -v
pod --version
docker --version
```

## 1. Install Dependencies

From the repo root:

```bash
pnpm install
```

## 2. Create Local API Config

Create `apps/api/.env` with a local SQLite database and local service endpoints:

```bash
cat > apps/api/.env <<'EOF'
NODE_ENV=development
API_PORT=3001
API_HOST=0.0.0.0
CORS_ORIGIN=http://localhost:3000,http://localhost:5174

DATABASE_URL="file:./dev.db"
REDIS_URL="redis://localhost:6379"

S3_BUCKET=twin
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_ENDPOINT=http://localhost:9000

TRANSCRIPTION_PROVIDER=mock
DEBRIEF_PROVIDER=mock

MAX_UPLOAD_SIZE_MB=500
DIARIZATION_SERVICE_URL=http://localhost:8001
EOF
```

If you want real AI instead of mock processing, add:

```bash
OPENAI_API_KEY=your_key_here
TRANSCRIPTION_PROVIDER=openai
DEBRIEF_PROVIDER=openai
```

## 3. Create Mobile Env

The iOS app reads `EXPO_PUBLIC_*` values from Expo config. For local development, create a mobile `.env` from the example:

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

For Simulator use:

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:3001
```

If you are missing Firebase values, copy them from `apps/mobile/app.json` or replace them with your own Firebase project values.

## 4. Start Local Services

Start Redis, MinIO, and the diarization service:

```bash
docker compose up redis minio minio-init diarization
```

Leave that terminal running.

## 5. Build Shared Packages

```bash
pnpm --filter=@twin/shared build
pnpm --filter=@twin/ui build
```

## 6. Prepare the Database

```bash
pnpm --filter=@twin/api db:push
```

## 7. Start the API and Worker

In two separate terminals from the repo root:

```bash
pnpm run dev:api
```

```bash
pnpm run dev:worker
```

At this point the backend should be available at `http://localhost:3001`.

## 8. Start Metro for the iOS App

Use the local API base URL when starting Expo/Metro:

```bash
pnpm run dev:metro
```

Leave that terminal running.

## 9. Open the App in Xcode

Open the workspace:

```bash
pnpm run xcode:open
```

In Xcode:

1. Select the `twin` scheme.
2. Choose an iPhone simulator.
3. If signing is required, set your Apple Development Team under `twin` target → Signing & Capabilities.
4. Press Run.

If CocoaPods ever gets out of sync again, rerun:

```bash
pnpm run pods:install
```

## 10. First Local Run Checklist

Before expecting the app to work end to end, make sure:

- Docker services are still running
- API server is running on port `3001`
- Worker is running
- Metro is running with `EXPO_PUBLIC_API_BASE_URL=http://localhost:3001`
- Xcode is opening `ios/twin.xcworkspace`, not the `.xcodeproj`

## Common Local Issues

`App still talks to production API`

- Stop Metro and restart it with:

```bash
pnpm run dev:metro
```

`Recordings stay in processing`

- The worker is not running. Start:

```bash
pnpm --filter=@twin/api dev:worker
```

`Upload fails`

- Check that MinIO is running on `localhost:9000`
- Check that `S3_ENDPOINT`, `S3_BUCKET`, and MinIO credentials in `apps/api/.env` match the values above

`Voice/profile or diarization features fail`

- Confirm the diarization container is healthy:

```bash
curl http://localhost:8001/health
```

`Need a clean iOS dependency refresh`

```bash
cd ios
rm -rf Pods Podfile.lock
pod install
```

## Repo Notes

- `packages/shared/src/` is the source of truth for shared models and API helpers.
- `packages/shared/dist/` is generated build output. Rebuild it with `pnpm --filter=@twin/shared build` when the shared package changes.
- The mobile app consumes `@twin/shared` directly from the workspace package, so there is no tracked vendored copy to keep in sync.
- Use `ios/twin.xcworkspace`, not the `.xcodeproj`.
- The local quick path in this README is intentionally SQLite + Docker-backed services so a new engineer can boot the app without provisioning separate cloud infrastructure.

## Useful Commands

From the repo root:

```bash
pnpm --filter=@twin/api typecheck
pnpm --filter=@twin/web typecheck
pnpm --filter=@twin/mobile exec tsc --noEmit
```

To stop local infra:

```bash
docker compose down
```
