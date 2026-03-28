# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Twin (internal name: Komuchi) is an audio transcription and AI-powered debrief generation platform. It is a Turborepo monorepo using pnpm workspaces containing:

- `apps/api` — Fastify REST API + BullMQ worker
- `apps/mobile` — React Native/Expo iOS app
- `apps/web` — Next.js 14 web dashboard
- `packages/shared` — Zod schemas, types, and API client shared across apps
- `packages/ui` — Shared React component library (web)
- `services/diarization` — Optional Python FastAPI service for speaker identification

## Commands

All commands require **pnpm** (v9.15.0) and **Node >= 20**.

```bash
# Development
pnpm dev                              # Run all apps in parallel (turbo)
pnpm --filter=@komuchi/api dev        # Run API only
pnpm --filter=@komuchi/web dev        # Run web only

# Build
pnpm build                            # Build all packages
pnpm typecheck                        # TypeScript check across all packages

# Lint & Format
pnpm lint                             # ESLint (--max-warnings 0)
pnpm lint:fix                         # Auto-fix lint issues
pnpm format                           # Prettier formatting
pnpm format:check                     # Check formatting without changes

# Testing
pnpm test                             # Run all tests
pnpm test:watch                       # Watch mode
pnpm test:coverage                    # With coverage reports
pnpm --filter=@komuchi/api test       # API tests only
pnpm --filter=@komuchi/web test       # Web tests only

# Run a single test file
pnpm --filter=@komuchi/api test src/routes/__tests__/health.test.ts

# Database
pnpm --filter=@komuchi/api db:migrate # Run Prisma migrations
pnpm --filter=@komuchi/api db:seed    # Seed database
pnpm --filter=@komuchi/api db:studio  # Open Prisma Studio

# Clean
pnpm clean                            # Remove build outputs and node_modules
```

Mobile app runs via Expo:

```bash
cd apps/mobile && npx expo start      # Start Expo dev server
cd apps/mobile && npx expo run:ios    # Build and run on iOS simulator
```

## Architecture

### Data Flow

Audio recording → S3 upload (presigned URL) → API creates `Recording` + `Job` records → BullMQ job queued → Worker picks up job → Transcription (OpenAI Whisper / Deepgram / mock) → optional speaker diarization (Python service) → Debrief generation (GPT-4o structured output) → Results stored in PostgreSQL.

### API (`apps/api`)

- **Entry points:** `src/server.ts` (HTTP listener) and `src/worker.ts` (job processor) — run as separate processes.
- **Framework:** Fastify with plugins for Firebase JWT auth, multipart upload, rate limiting.
- **Database:** PostgreSQL via Prisma ORM (`src/lib/db.ts`). Schema at `prisma/schema.prisma`.
- **Jobs:** BullMQ with Redis (`src/queues/`). Two queues: `transcription` and `debrief`.
- **AI abstraction:** `src/lib/ai/` contains provider factories for transcription and debrief — switching providers is done via env vars (`TRANSCRIPTION_PROVIDER`, `AI_PROVIDER`).
- **Storage:** S3-compatible via `src/lib/storage.ts` (AWS S3, Cloudflare R2, or MinIO).

Key DB models: `User` (with consent timestamps), `Recording` (status machine: `pending → uploaded → processing → complete/failed`), `Transcript`, `Debrief`, `Job`, `ChatSession`, `ChatMessage`.

### Web (`apps/web`)

- **Framework:** Next.js 14 App Router (not Pages Router).
- **Auth:** Firebase authentication via `src/lib/auth.tsx` context provider.
- **Data fetching:** TanStack React Query (`src/lib/query.tsx`).
- **Upload:** Client-side direct-to-S3 via presigned URLs (`src/lib/upload.ts`).
- Protected routes live under `src/app/(dashboard)/`.

### Mobile (`apps/mobile`)

- **Framework:** Expo SDK 54 (React Native).
- **Navigation:** Custom stack implementation in `App.tsx` — **not** React Navigation. Auth stack vs. app stack switching based on Firebase auth state.
- **Auth:** `contexts/AuthContext` wrapping Firebase.
- **Consent:** `contexts/ConsentContext` — the app has compliance-required consent gates for App Store review. Screens: `ConsentScreen` (initial gate), `DataConsentScreen` (manage), `PrivacyPolicyScreen`, `TermsOfServiceScreen`.
- **Persistence:** AsyncStorage for local state.

### Shared Packages

- `@komuchi/shared` — Import Zod schemas, TypeScript types, and the API client from here. Used by both web and mobile.
- `@komuchi/ui` — shadcn/ui-based components, used by web only.

## Testing

- **API and Web:** Vitest. Coverage thresholds: 70% (API), 60% (web).
- **Mobile:** Jest.
- API test utilities in `apps/api/src/__tests__/helpers/test-utils.ts` provide `createTestApp()`, `setupTestDatabase()`, `createTestUser()`, `getAuthHeaders()`.
- API integration tests require a running Redis instance.

## Commit Convention

CommitLint is enforced via Husky. Format: `type(scope): subject` where type is one of: `feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert`. Subject must be lowercase, max 72 chars.

## Code Style

- Prettier: single quotes, 2-space indent, 100 char line width, trailing commas (ES5), LF line endings.
- TypeScript: prefer `import type` for type-only imports (enforced by ESLint).
- `_` prefix on unused variables suppresses the lint error.
