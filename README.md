# AI Content Production Studio

AI-powered content production platform that transforms a creator's idea into a complete, editable, reviewable video using AI-generated scripts, scenes, visuals, narration, captions and automated FFmpeg rendering.

A creator describes an idea — *"a 5-minute explainer on how AI will change software development"* — and the platform turns it into a structured, reviewable production:

```
idea -> script -> scene breakdown -> character/visual bible -> visual prompts ->
image generation -> voiceover -> captions -> cinematic FFmpeg assembly -> thumbnail ->
YouTube metadata -> quality check -> user review -> (optional, explicit) publish
```

The creator stays in control at every step: nothing regenerates without being asked, and **nothing publishes to YouTube without an explicit, separately-confirmed action**.

## Who it's for

Solo creators and small teams who want to go from an idea to a publish-ready video without manually operating a script writer, an image generator, a TTS tool, a captioning tool, and a video editor as five separate apps — while still reviewing and approving every stage before it's final, and before anything goes to YouTube.

## How it works

1. **Plan** — an idea becomes a structured script: title, scenes, narration, camera direction, sound-effect cues, and a recurring-character "visual bible" so the same character looks consistent across every scene.
2. **Generate** — each scene's image, narration audio, and captions are generated in parallel background jobs, with live progress in the UI.
3. **Assemble** — FFmpeg composites every scene into one video: cinematic camera motion (zoom/pan/push), transitions between scenes, burned-in captions, a mastered audio mix (narration + optional ducked background music + optional sound effects, loudness-normalized), at your choice of 16:9 / 9:16 / 1:1 and Draft/Standard/High quality.
4. **Review** — three thumbnail options, a quality-check pass, and the full video are presented for the creator to accept or regenerate any individual stage (script, one scene's visual, one scene's voice, the thumbnails) without redoing the whole project.
5. **Publish** — optional, explicit: connect a YouTube channel via OAuth, set title/description/tags/visibility, confirm, and the video uploads for real.

## Key features

- **Character/Visual Bible** — recurring subjects stay visually consistent across scenes instead of a different-looking character every shot
- **Cinematic rendering, not a slideshow** — zoom in/out, pan, push/pull camera motion per scene; crossfade/fade/hard-cut transitions; 9 video styles (Documentary, Cinematic, Educational, Tech, Motivational, Storytelling, News, Faceless YouTube, Short-form) each biasing camera motion, transition pacing, and caption look
- **Professional audio mix** — narration is always the foreground; background music is sidechain-ducked under it (not just lowered), with fade in/out, and the whole mix is loudness-normalized (`loudnorm`) as a final master pass so output is never clipped or wildly inconsistent in volume between projects
- **Three output formats** — 16:9 landscape, 9:16 vertical (Shorts/Reels), 1:1 square — captions and camera motion scale correctly to each, not just the resolution
- **Dynamic, styled captions** — word-level karaoke-style highlight timing, 6 caption styles, burned in via FFmpeg (ASS subtitles), safe-area-aware per aspect ratio
- **Granular regeneration** — redo one scene's script, one scene's image, one scene's voice, or all thumbnails, without restarting the whole project or re-paying for everything
- **Structured AI output, never trusted blindly** — every AI response (script, scenes, visual bible, quality check) is parsed as JSON and validated against a Zod schema; a malformed response triggers an automatic retry-with-feedback, not a crash
- **Explicit, confirmed YouTube publishing** — OAuth-connected channel, draft title/description/tags/visibility the creator edits, a required confirmation flag the backend enforces server-side — publishing can never happen automatically
- **Real quota/outage resilience** — a Gemini quota exhaustion or transient 5xx retries once, then falls back to the mock content provider so the pipeline still completes instead of stalling the project; a background-music or sound-effect generation failure degrades to a voice-only mix instead of failing the whole render

## Architecture

```
Frontend (React/Vite)
        |  REST, JWT bearer auth
        v
Backend API (Express)  --->  PostgreSQL (Prisma)
        |                          ^
        v  enqueue                 |
Redis + BullMQ (8 queues)  --------+
        |
        v
Background workers (same codebase, separate process)
        |
        +--> AI provider (script/scenes/visual bible/quality check)
        +--> Visual generation provider (per-scene images)
        +--> Voice generation provider (per-scene narration)
        +--> FFmpeg (captions, camera motion, transitions, audio mix, render)
        +--> Storage provider (local disk in dev / S3-compatible in production)
        +--> YouTube Data API (explicit, user-confirmed publish only)
```

Every external dependency (AI content, visual generation, voice generation, storage, publishing) sits behind a provider interface with a real implementation and a free/zero-cost mock implementation, selected per-category by an environment variable — see [ARCHITECTURE.md](./ARCHITECTURE.md) for the full diagram and [AI_PIPELINE.md](./AI_PIPELINE.md) for the pipeline's state machine.

## Technologies

| Layer | Stack |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS, TanStack Query |
| Backend | Node.js, TypeScript, Express, Zod validation, JWT auth |
| Database | PostgreSQL + Prisma ORM (17 tables, migration-managed) |
| Jobs | Redis + BullMQ, 8 queues, exponential backoff, idempotency keys |
| Rendering | FFmpeg (camera motion, transitions, ASS captions, sidechain-ducked audio mix, `loudnorm` mastering) |
| AI content | Anthropic Claude, Google Gemini (free tier), or a deterministic mock |
| Visual generation | OpenArt, Pollinations (free), or a deterministic mock |
| Voice generation | ElevenLabs-compatible TTS, Pollinations, Microsoft Edge TTS (free, no key), Windows SAPI (offline), or a deterministic mock |
| Storage | S3-compatible (AWS S3 / Cloudflare R2 / Supabase Storage) or local disk in dev |
| Publishing | YouTube Data API v3 (real OAuth, real uploads — see "Live integrations" below) |

## AI pipeline

Every AI call (project plan, character bible, single-scene regeneration, quality check) goes through one path: **generate → validate against a Zod schema → on failure, retry once with the validation error fed back to the model as correction instructions → on a transient provider error, retry once more before falling back to the mock provider** — never a bare, untyped blob of text trusted downstream. See [AI_PIPELINE.md](./AI_PIPELINE.md) for the schemas and retry policy in full.

## Video generation pipeline

Per-scene generation (visuals, voice) runs as independent, parallel background jobs with per-scene idempotency keys, fanning in to the next stage only once every scene in the batch has reached a terminal state — including the all-failed case, which fails the project with a clear reason instead of hanging forever. Rendering then composites everything with FFmpeg: camera motion and transitions driven by the chosen video style, captions burned in from ASS subtitles sized to the chosen aspect ratio, and a final mastered audio mix. See [AI_PIPELINE.md](./AI_PIPELINE.md) for the full per-stage breakdown.

## Local setup

```bash
# 1. Install dependencies (root workspace covers both backend and frontend)
npm install

# 2. Configure environment
cp .env.example .env
# Fill in DATABASE_URL / REDIS_URL for your local Postgres/Redis (docker-compose.yml
# at the repo root brings both up if you don't already have them running:
# docker compose up -d).
# Every *_PROVIDER var defaults to "mock" -- no API keys needed to run the full
# pipeline, FFmpeg rendering included.

# 3. Set up the database
cd backend
npx prisma migrate dev

# 4. Run it (three processes)
npm run dev            # API server, :4000
npm run dev:worker      # background job workers (separate terminal)
cd ../frontend && npm run dev   # SPA, :5173 (proxies /api to :4000)
```

Visit `http://localhost:5173`, register an account, and create a project. With every provider on `mock`, the entire pipeline — script, scenes, character bible, per-scene images, narration, captions, a real FFmpeg-rendered MP4, and thumbnails — completes in well under a minute, with progress visible live, at zero cost.

## Environment variables

Every variable, required-vs-optional, and what each provider needs is documented in [ENVIRONMENT.md](./ENVIRONMENT.md). The short version: nothing is required beyond `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, and `SESSION_SECRET` to run the full pipeline against mock providers; every `*_PROVIDER` variable switches one category (AI content, visuals, voice, storage, publishing) to a real implementation and pulls in that implementation's own required keys.

## Testing

```bash
cd backend && npm test        # 230 tests, 31 suites -- unit + integration against real local Postgres/Redis
npm run typecheck              # both workspaces
npm run lint                   # both workspaces
```

Integration tests run real BullMQ workers against a real local Postgres and Redis (not mocked), covering the pipeline's race conditions directly: idempotent job creation under concurrency, the fan-in logic when every scene in a batch fails, double-publish prevention, and a project cancelled mid-flight actually stopping in-flight work rather than silently continuing. See [TESTING.md](./TESTING.md) for what's covered and the full list of what remains manually-tested-only.

## Deployment

[DEPLOYMENT.md](./DEPLOYMENT.md) documents a concrete target architecture (frontend on a static host or nginx; backend API and worker as two independently-scaled processes from the same build; managed Postgres/Redis; S3-compatible storage), exact env vars per service, and `backend/Dockerfile` / `frontend/Dockerfile` for a containerized deployment. **This has not been deployed to a real cloud environment as part of building this project** — see DEPLOYMENT.md's own honesty note on exactly what has and hasn't been verified (including that the Dockerfiles haven't been `docker build`-tested, since no Docker daemon was available in the environment they were written in).

`GET /health` (liveness), `/health/ready` (checks Postgres + Redis), and `/health/queues` (BullMQ queue depths) are the operational endpoints to point a platform's health check and monitoring at.

## Live integrations successfully verified

Actually exercised against the real, live third-party service (not just implemented and typechecked):

- **Google Gemini** — real script/character-bible/quality-check generation confirmed working end to end, including hitting the real free-tier daily quota (429) and confirming the retry-then-fallback-to-mock behavior completes the project anyway rather than stalling it
- **YouTube Data API** — real OAuth connect flow, real video upload, confirmed landing on an actual YouTube channel

## Integrations that still require credentials to verify

Implemented and typechecked against each vendor's documented API shape, but not exercised against a live account in this environment:

- **OpenArt** (visual generation) — see the doc comment at the top of `backend/src/services/visual/OpenArtProvider.ts`; its exact endpoint paths/response field names should be confirmed against a real key before production use
- **Anthropic Claude** (AI content, alternative to Gemini)
- **ElevenLabs-compatible TTS** (voice generation, alternative to the free providers)
- **S3-compatible storage** (AWS S3 / Cloudflare R2 / Supabase Storage)

## Known limitations

- **OpenArt's API contract is unverified** (see above) — Pollinations (free) and the mock provider are fully exercised; OpenArt's request/response shape should be confirmed against a real account first.
- **No real-time push updates** — the frontend polls for pipeline progress (every 2s while a project is actively generating) rather than using Server-Sent Events or WebSockets. This was a deliberate choice, not an oversight: polling is simple, already working, and the pipeline's natural update cadence (seconds per stage) doesn't need sub-second push latency.
- **Dockerfiles are untested** — written to match the actual build scripts and file layout, but `docker build` has not been run against them (no Docker daemon available in this environment).
- **No deployment has actually been executed** — DEPLOYMENT.md is a concrete, specific plan, not a record of a completed deployment.
- **Thumbnails are always generated at 16:9** regardless of the project's chosen aspect ratio, matching YouTube's own custom-thumbnail requirement (which is 16:9 platform-wide, including for vertical Shorts) — not a bug, but worth knowing if you expected a portrait thumbnail for a portrait video.
- **No billing/payment integration** — only the usage-tracking foundation exists (every AI/render/storage/publish action is metered and queryable), with no Stripe or similar billing layer on top.

## Roadmap

Ideas not yet built, roughly in the order they'd add the most value:

- Real-time pipeline status via Server-Sent Events, if polling latency ever becomes a real problem at scale
- A/B thumbnail performance tracking against real YouTube Analytics data (the stats-fetch plumbing already exists for post-publish view/like/comment counts)
- Multi-language narration and captions
- A billing layer on top of the existing usage-metering foundation
- Verifying OpenArt's real API contract and Claude/ElevenLabs/S3 against live credentials

## Documentation

| Doc | Covers |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System diagram, folder structure, provider abstractions, state machine, job pipeline, security posture |
| [API.md](./API.md) | Every REST endpoint |
| [DATABASE.md](./DATABASE.md) | Schema, tables, relationships |
| [AI_PIPELINE.md](./AI_PIPELINE.md) | Structured AI output, validation/retry policy, Character/Visual Bible, pipeline stages |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Cloud deployment plan, Dockerfiles, health/observability endpoints |
| [ENVIRONMENT.md](./ENVIRONMENT.md) | Every environment variable, required vs. optional |
| [TESTING.md](./TESTING.md) | What's tested, how to run it, what's known-untested |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Common problems and fixes |
