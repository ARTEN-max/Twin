# =========================================
# Twin Web App Dockerfile
# =========================================
# Build context must be the monorepo root:
#   docker build -f apps/web/Dockerfile .
# =========================================

# ---- Base ----
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps

# Copy only what pnpm needs to resolve packages
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/

# Install all dependencies (including devDependencies for build)
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---- Build ----
FROM deps AS build

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/ui ./packages/ui
COPY apps/web ./apps/web

# Build workspace packages first, then the web app
RUN pnpm --filter=@twin/shared build
RUN pnpm --filter=@twin/ui build

# Set API_URL for the Next.js build so rewrites point to the Docker service name.
# This gets baked into .next/routes-manifest.json during `next build`.
ARG API_URL=http://api:3001
ENV API_URL=$API_URL
RUN pnpm --filter=@twin/web build

# ---- Runtime ----
FROM base AS runtime
ENV NODE_ENV=production

# Copy built output and dependencies
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/.npmrc ./
COPY --from=build /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/package.json ./apps/web/
COPY --from=build /app/apps/web/next.config.mjs ./apps/web/
COPY --from=build /app/apps/web/postcss.config.mjs ./apps/web/
COPY --from=build /app/apps/web/tailwind.config.ts ./apps/web/
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/ui/dist ./packages/ui/dist
COPY --from=build /app/packages/ui/package.json ./packages/ui/

EXPOSE 3000

CMD ["pnpm", "--filter=@twin/web", "start"]
