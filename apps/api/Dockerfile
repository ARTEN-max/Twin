# =========================================
# Twin API Dockerfile
# =========================================
# Build context must be the monorepo root:
#   docker build -f apps/api/Dockerfile .
# =========================================

# ---- Base ----
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps

# Copy only what pnpm needs to resolve packages
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/

# Install all dependencies (including devDependencies for build)
# Note: Cache mount omitted for Railway compatibility (requires cache key prefix)
RUN pnpm install --frozen-lockfile

# ---- Build ----
FROM deps AS build

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/ui ./packages/ui
COPY apps/api ./apps/api

# Build shared packages first, then the API
RUN pnpm --filter=@twin/shared build
RUN pnpm --filter=@twin/api build

# ---- Runtime ----
FROM base AS runtime
ENV NODE_ENV=production

# Install ffmpeg for audio transcoding (chunking long recordings for Whisper)
RUN apk add --no-cache ffmpeg

# Copy built output and dependencies
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/.npmrc ./
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/

# Copy entrypoint script
COPY apps/api/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create data directory for SQLite
RUN mkdir -p /data

EXPOSE 3001

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "apps/api/dist/server.js"]
