# Environment Variables

Copy `.env.example` to `.env` at the repo root before running anything locally. The backend loads it via `dotenv` and validates every variable at startup with Zod (`backend/src/config/env.ts`) — a missing or invalid required variable stops the process immediately with a clear message rather than failing later inside a request handler.

## Core

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development` \| `test` \| `production` |
| `PORT` | no | `4000` | API server port |
| `FRONTEND_URL` | no | `http://localhost:5173` | Used for CORS and OAuth redirects |
| `BACKEND_URL` | no | `http://localhost:4000` | Used to build local storage URLs |

## Database

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | **yes** | PostgreSQL connection string, e.g. `postgresql://user:pass@host:5432/dbname` |

## Redis / background jobs

| Variable | Required | Notes |
|---|---|---|
| `REDIS_URL` | **yes** | Used by BullMQ for all 8 job queues |

## Auth

| Variable | Required | Notes |
|---|---|---|
| `JWT_SECRET` | **yes** | ≥16 chars. Signs session tokens. |
| `JWT_EXPIRES_IN` | no | Default `7d` |
| `SESSION_SECRET` | **yes** | ≥16 chars. Also used (via scrypt) to derive the key that encrypts stored YouTube OAuth tokens — see `backend/src/utils/crypto.ts`. |

## AI: Anthropic Claude

| Variable | Required | Notes |
|---|---|---|
| `AI_PROVIDER` | no | `mock` (default) or `claude` |
| `ANTHROPIC_API_KEY` | only if `AI_PROVIDER=claude` | Never sent to the frontend |
| `ANTHROPIC_MODEL` | no | Default `claude-sonnet-5` |

## Visual generation: OpenArt

| Variable | Required | Notes |
|---|---|---|
| `VISUAL_PROVIDER` | no | `mock` (default) or `openart` |
| `OPENART_API_KEY` | only if `VISUAL_PROVIDER=openart` | |
| `OPENART_BASE_URL` | no | Default `https://api.openart.ai` |

## Voice generation (TTS)

| Variable | Required | Notes |
|---|---|---|
| `VOICE_PROVIDER` | no | `mock` (default) or `tts` |
| `TTS_API_KEY` | only if `VOICE_PROVIDER=tts` | |
| `TTS_PROVIDER_BASE_URL` | no | Default is an ElevenLabs-compatible endpoint |

## Storage

| Variable | Required | Notes |
|---|---|---|
| `STORAGE_PROVIDER` | no | `local` (default, dev only) or `s3` |
| `STORAGE_LOCAL_ROOT` | no | Default `./storage`, only used when `STORAGE_PROVIDER=local` |
| `STORAGE_BUCKET` | only if `STORAGE_PROVIDER=s3` | |
| `STORAGE_REGION` | only if `STORAGE_PROVIDER=s3` | |
| `STORAGE_ENDPOINT` | no | Set for R2/Supabase/MinIO; omit for real AWS S3 |
| `STORAGE_ACCESS_KEY` | only if `STORAGE_PROVIDER=s3` | |
| `STORAGE_SECRET_KEY` | only if `STORAGE_PROVIDER=s3` | |
| `STORAGE_PUBLIC_BASE_URL` | no | If set, uploads return this + key instead of a signed URL |

## Video rendering

| Variable | Required | Default |
|---|---|---|
| `FFMPEG_PATH` | no | `/usr/bin/ffmpeg` |
| `FFPROBE_PATH` | no | `/usr/bin/ffprobe` |

## Publishing: YouTube

| Variable | Required | Notes |
|---|---|---|
| `PUBLISHING_PROVIDER` | no | `mock` (default) or `youtube` |
| `YOUTUBE_CLIENT_ID` | only if `PUBLISHING_PROVIDER=youtube` | Google OAuth client |
| `YOUTUBE_CLIENT_SECRET` | only if `PUBLISHING_PROVIDER=youtube` | |
| `YOUTUBE_REDIRECT_URI` | only if `PUBLISHING_PROVIDER=youtube` | Must match the OAuth client's configured redirect URI, e.g. `http://localhost:4000/api/youtube/oauth/callback` |

## Rate limiting / logging

| Variable | Required | Default |
|---|---|---|
| `RATE_LIMIT_WINDOW_MS` | no | `60000` |
| `RATE_LIMIT_MAX_REQUESTS` | no | `100` |
| `LOG_LEVEL` | no | `info` |

Rate limiting is automatically disabled when `NODE_ENV=test` so the integration test suite isn't throttled by production-tuned limits (see `backend/src/middleware/rateLimit.ts`).

## Provider selection

Every external service has a `mock` implementation used by default so the whole app — including the full generation pipeline end to end — runs locally with **zero API keys and zero cost**. Set the matching `*_PROVIDER` variable to switch to the real implementation once you have credentials:

```
AI_PROVIDER=claude
VISUAL_PROVIDER=openart
VOICE_PROVIDER=tts
STORAGE_PROVIDER=s3
PUBLISHING_PROVIDER=youtube
```
