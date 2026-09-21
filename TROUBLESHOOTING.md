# Troubleshooting

## "Application failed to start due to invalid environment configuration"

`backend/src/config/env.ts` validates every env var with Zod at process startup and prints exactly which ones are missing/invalid, e.g.:
```
Invalid environment configuration:
  - DATABASE_URL: DATABASE_URL is required
  - ANTHROPIC_API_KEY: ANTHROPIC_API_KEY is required when AI_PROVIDER=claude
```
Fix the named variable(s) in `.env`. This is by design — the app refuses to boot into a state where it would fail confusingly on the first real request instead.

## Generated images/audio/video won't load in the browser (CORS / blocked)

If you're using `STORAGE_PROVIDER=local` and see `net::ERR_BLOCKED_BY_RESPONSE` or similar in the browser console for `/storage/...` URLs, make sure you're running the version of `app.ts` that sets `crossOriginResourcePolicy: { policy: "cross-origin" }` on Helmet (this is the default in this repo) — an overly strict same-origin policy on the static `/storage` mount blocks the frontend, which runs on a different origin/port in dev, from loading them as `<img>`/`<audio>`/`<video>` subresources. In production with `STORAGE_PROVIDER=s3`, the equivalent fix is CORS configuration on the S3 bucket itself (see DEPLOYMENT.md step 3).

## A project gets stuck and never reaches `READY_FOR_REVIEW` or `FAILED`

Check `GET /api/projects/:id/status` for the job list. If a job shows `FAILED`, the project should also transition to `FAILED` — if it doesn't, that's a state-machine gap (see `ProjectStateMachine.ts`; every non-terminal state should have a path to `FAILED`). If a job is stuck `PENDING` forever, the worker process (`npm run dev:worker` / `node dist/queues/worker.js`) probably isn't running, or Redis isn't reachable — check `REDIS_URL` and that the worker process's logs show `"Background workers started"`.

## "Record to update not found" errors in the worker log

This means a `Job` row a worker is trying to update no longer exists in Postgres. In normal operation this shouldn't happen. It **will** happen if you run the automated test suite (`npm test`, which uses its own `ai_content_studio_test` database) at the same time as a dev server/worker pointed at the real Redis instance — both consume from the same BullMQ queues, so a dev worker can pick up a job the test suite created and already cleaned up from its own database. Stop one before running the other (see TESTING.md's isolation note). If you see this outside of that scenario, it's a real bug worth investigating.

## `npx prisma migrate dev` fails to connect

Confirm PostgreSQL is running and `DATABASE_URL` in `.env` matches a real, reachable database/user/password. Locally: `sudo service postgresql start` (Ubuntu/Debian) and `sudo -u postgres psql -c "SELECT 1"` to sanity-check the server is up before touching Prisma.

## FFmpeg rendering fails

- Confirm `ffmpeg`/`ffprobe` are installed and `FFMPEG_PATH`/`FFPROBE_PATH` point at real executables (`ffmpeg -version` should work from the same shell the worker runs in).
- `FFmpegRenderer` requires every scene to have a `READY` image asset before rendering — if a scene's visual generation job failed, render will throw `Scene N has no ready image asset`. Regenerate that scene's visual (`POST /scenes/:id/visual`) and re-render.

## YouTube publishing returns `501 NOT_CONFIGURED`

`PUBLISHING_PROVIDER=youtube` requires `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, and `YOUTUBE_REDIRECT_URI` to all be set — the app deliberately refuses to attempt OAuth with a partially-configured client rather than failing deep inside Google's SDK. Leave `PUBLISHING_PROVIDER=mock` (the default) for local development without a Google Cloud project.

## Claude (or any AI call) keeps failing with `AI_RESPONSE_VALIDATION_ERROR`

`ClaudeProvider` retries up to 3 times, feeding the previous validation error back into the prompt, before giving up. If it still fails after 3 attempts, the model is producing output that doesn't match the expected JSON shape (see `services/ai/schemas.ts`) — check the job's `errorMessage` for the specific validation failure, which usually points at a schema/prompt mismatch worth tightening the prompt for (`ClaudeProvider`'s per-method prompts).

## OpenArt integration errors

`OpenArtProvider`'s exact endpoint paths were not verified against a live account (see AI_PIPELINE.md's "Known limitation"). If real OpenArt calls fail, check the response body logged in the `ProviderError` and adjust `createGenerationJob`/`pollGenerationJob` in `services/visual/OpenArtProvider.ts` against OpenArt's current API reference.

## `npm audit` reports advisories (1 critical, 1 high, 9 moderate)

All of them require a major/breaking dependency upgrade with no drop-in patch, so none were taken blind:

- **critical/high — `vite`/`vitest`** (frontend `devDependencies` only): path-traversal/arbitrary-file-read issues in the Vite dev server and Vitest's mocker/UI server. These never ship — `vite build`'s output contains no Vite/Vitest code — and are only reachable by something on the same network reaching the local dev server directly. Fixing requires Vite 5→6+/Vitest major bumps.
- **moderate — `react-router`**: open redirect via a crafted `<Link>`/`useNavigate` target. This app never passes user-controlled input into a route target, so the practical risk here is low. Fix requires react-router 6→7 (a real API migration, not a patch).
- **moderate — `uuid`**: pulled in transitively by `googleapis` (not used directly by this codebase — `node:crypto`'s `randomUUID()` is used everywhere instead). Fix requires a `googleapis` major bump.

Re-run `npm audit` periodically and take these upgrades once there's dedicated time to verify each doesn't break routing or the YouTube integration.

## Rate limit errors during local testing

`RATE_LIMIT_MAX_REQUESTS`/`RATE_LIMIT_WINDOW_MS` apply in development. If you're scripting many requests against a local dev server (not the automated test suite, which already disables rate limiting), raise `RATE_LIMIT_MAX_REQUESTS` in `.env` or space out requests.
