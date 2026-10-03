# Builds the static SPA and serves it with nginx, reverse-proxying /api to
# the backend container so the frontend's hardcoded same-origin `/api`
# base URL (see src/lib/api.ts) works without a build-time API domain.
#
# This is one deployment option among the ones DEPLOYMENT.md documents --
# the simplest path remains a static host (Vercel/Netlify/Cloudflare
# Pages) pointed at a separately-hosted API domain, which needs no
# Dockerfile at all. Use this image instead for a self-hosted/docker-
# compose/single-VM deployment where frontend and backend share a
# reverse proxy.
#
# Build from the repo root (needs the root package.json for npm
# workspaces to resolve), e.g.:
#   docker build -f frontend/Dockerfile -t ai-content-studio-frontend .
#
# At container start, set BACKEND_URL to the backend's reachable address
# (e.g. "http://backend:4000" in docker-compose, using the service name):
#   docker run -e BACKEND_URL=http://backend:4000 -p 8080:80 <image>

FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

COPY frontend frontend
RUN npm run build --workspace frontend

FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf.template /etc/nginx/templates/default.conf.template

# Referenced by nginx.conf.template via envsubst (nginx's official image
# runs every /etc/nginx/templates/*.template through envsubst into
# /etc/nginx/conf.d/ on startup) -- overridden by `docker run -e` /
# docker-compose `environment:` to point at the real backend service.
ENV BACKEND_URL=http://backend:4000

EXPOSE 80
