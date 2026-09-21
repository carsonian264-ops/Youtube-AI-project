# Deployment

This describes how to take the app from local development to a real cloud deployment. **Nothing here has been deployed as part of building this project** — this is a plan and the configuration to execute it, not a record of a completed deployment. Every command below should be run by whoever operates the real infrastructure.

## Target architecture

```
Frontend (Vercel / Netlify / Cloudflare Pages)
        |
        v  HTTPS
Backend API (Render / Railway / Fly.io / AWS ECS) ---> Managed PostgreSQL
        |                                        \
        v                                         --> Managed Redis
Worker process (same platform, separate service) --/
        |
        v
S3-compatible object storage (AWS S3 / Cloudflare R2 / Supabase Storage)
        |
        v
External APIs: Anthropic Claude, OpenArt, TTS provider, YouTube Data API
```

The API server and the worker process are **two separate deployable services built from the same codebase** (`npm run build` produces both `dist/server.js` and `dist/queues/worker.js`) — they scale independently, and only the worker needs FFmpeg available on its host.

## Steps

1. **Create the database.** Provision managed PostgreSQL (e.g. Render Postgres, Railway Postgres, Supabase, RDS). Note the connection string for `DATABASE_URL`.
2. **Create Redis.** Provision managed Redis (e.g. Upstash, Render Redis, ElastiCache). Note the connection string for `REDIS_URL`.
3. **Create the storage bucket.** Create an S3 bucket (or R2/Supabase Storage bucket). Configure CORS on the bucket to allow `GET` from your frontend's origin (required for `<img>`/`<video>`/`<audio>` to load generated media). Note bucket name, region, endpoint (if not AWS), and an access key pair.
4. **Configure environment variables** on both the API and worker services (see ENVIRONMENT.md for the full list). At minimum for production:
   ```
   NODE_ENV=production
   DATABASE_URL=...
   REDIS_URL=...
   JWT_SECRET=<generate a long random value>
   SESSION_SECRET=<a different long random value>
   STORAGE_PROVIDER=s3
   STORAGE_BUCKET=...
   STORAGE_REGION=...
   STORAGE_ACCESS_KEY=...
   STORAGE_SECRET_KEY=...
   STORAGE_PUBLIC_BASE_URL=... (or leave unset to use signed URLs)
   AI_PROVIDER=claude
   ANTHROPIC_API_KEY=...
   VISUAL_PROVIDER=openart
   OPENART_API_KEY=...
   VOICE_PROVIDER=tts
   TTS_API_KEY=...
   PUBLISHING_PROVIDER=youtube
   YOUTUBE_CLIENT_ID=...
   YOUTUBE_CLIENT_SECRET=...
   YOUTUBE_REDIRECT_URI=https://your-api-domain/api/youtube/oauth/callback
   FRONTEND_URL=https://your-frontend-domain
   BACKEND_URL=https://your-api-domain
   ```
   Apply migrations before first boot: `npx prisma migrate deploy` (run once, e.g. as a release/predeploy command).
5. **Deploy the backend API.** Build command: `npm install && npm run build` (from `backend/`). Start command: `npm start` (`node dist/server.js`). Health check path: `/health`.
6. **Deploy the worker.** Same image/build as the API, different start command: `npm run start:worker` (`node dist/queues/worker.js`). The worker's host must have `ffmpeg`/`ffprobe` installed (set `FFMPEG_PATH`/`FFPROBE_PATH` if not at `/usr/bin/`) — most platforms need a Docker image with FFmpeg baked in (e.g. an `apt-get install ffmpeg` layer) rather than a bare Node buildpack.
7. **Deploy the frontend.** Build command: `npm install && npm run build` (from `frontend/`). Output directory: `dist/`. Set `VITE_BACKEND_URL` at build time if the API isn't reverse-proxied under the same domain at `/api`.
8. **Configure your domain(s) and HTTPS.** Point the frontend and API at their respective domains/subdomains; most platforms in step 5–7 provision TLS automatically.
9. **Configure OAuth.** In Google Cloud Console, create OAuth 2.0 credentials for the YouTube Data API, add `YOUTUBE_REDIRECT_URI` as an authorized redirect URI, and request the `youtube.upload`/`youtube.readonly` scopes (see `youtube.controller.ts`). Google may require app verification before `PUBLIC` visibility publishing works for non-test users.
10. **Test the production workflow.** Register a real account, create a project, run `/generate` end to end with real providers, confirm a video renders and a thumbnail generates, connect a YouTube channel, and publish one video with `visibility: PRIVATE` first before trusting the pipeline with `PUBLIC`.

## Suggested platform pairings

| Component | Options |
|---|---|
| Frontend | Vercel, Netlify, Cloudflare Pages |
| Backend API + worker | Render, Railway, Fly.io, AWS ECS/Fargate |
| PostgreSQL | Render Postgres, Railway Postgres, Supabase, AWS RDS |
| Redis | Upstash, Render Redis, AWS ElastiCache |
| Object storage | AWS S3, Cloudflare R2, Supabase Storage |

## Local development (for comparison)

```bash
cp .env.example .env             # then fill in DATABASE_URL/REDIS_URL for your local Postgres/Redis
cd backend && npx prisma migrate dev && npm run dev        # API on :4000
cd backend && npm run dev:worker                            # worker process
cd frontend && npm run dev                                  # SPA on :5173, proxies /api to :4000
```

Every `*_PROVIDER` env var defaults to `mock`, so this runs the entire pipeline — including FFmpeg video rendering — with zero API keys and zero external cost. `docker-compose.yml` at the repo root brings up local Postgres + Redis if you don't already have them running.
