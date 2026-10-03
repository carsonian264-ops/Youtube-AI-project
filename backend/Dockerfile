# Builds the backend once and serves both deployable processes from the
# same image -- the API server and the worker (see DEPLOYMENT.md, "the API
# server and the worker process are two separate deployable services built
# from the same codebase"). Which one a container runs is just the CMD:
#
#   docker run <image>                              # API server (default)
#   docker run <image> node dist/queues/worker.js    # worker
#
# Build from the repo root (this Dockerfile needs the root package.json
# and the frontend workspace's package.json for `npm ci` to resolve the
# npm-workspaces monorepo correctly), e.g.:
#   docker build -f backend/Dockerfile -t ai-content-studio-backend .

FROM node:20-bookworm-slim AS build
WORKDIR /app

# Workspace manifests only, first, so `npm ci` is cached across rebuilds
# that only change application source.
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

# The Prisma client is generated from the schema (not part of `npm run
# build`, which only compiles TypeScript -- see backend/package.json's
# separate prisma:generate script) and is imported by application code,
# so it has to exist before `tsc` runs.
COPY backend/prisma backend/prisma
RUN npm run prisma:generate --workspace backend

COPY backend backend
RUN npm run build --workspace backend

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# FFmpeg is required by the worker process (video rendering, audio
# mixing/ducking/normalization, thumbnail compositing) -- not by the API
# server, but this image is shared between both, so it's installed
# unconditionally rather than maintaining two separate images for one
# codebase.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# node_modules is hoisted to the workspace root by npm workspaces, so a
# single copy here is resolved correctly by Node's normal upward
# node_modules lookup from backend/dist, no per-workspace copy needed.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/package.json ./backend/package.json
# Kept in the runtime image (not just the build stage) so `npx prisma
# migrate deploy` -- the documented release/predeploy step in
# DEPLOYMENT.md -- can be run directly from this image.
COPY --from=build /app/backend/prisma ./backend/prisma

WORKDIR /app/backend
EXPOSE 4000

CMD ["node", "dist/server.js"]
