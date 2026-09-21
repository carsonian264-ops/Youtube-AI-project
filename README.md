# AI Content Production Studio

An end-to-end AI-powered video production platform. A user describes an idea — *"Create a 5-minute YouTube video explaining how artificial intelligence will change software development"* — and the platform turns it into a structured, reviewable production pipeline:

```
idea -> script -> scene breakdown -> character/visual bible -> visual prompts ->
image generation -> voiceover -> captions -> video assembly -> thumbnail ->
YouTube metadata -> quality check -> user review -> (optional, explicit) publish
```

The user stays in control at every step: nothing regenerates without being asked, and **nothing publishes to YouTube without an explicit, separately-confirmed action**.

## What this is

A real full-stack application, not a demo wired directly to an AI API:

- **React + TypeScript + Vite + Tailwind** frontend — a working SaaS dashboard (auth, project workspace, pipeline visualization, per-scene regeneration, video/thumbnail preview, YouTube publish flow with an explicit confirmation step)
- **Node.js + TypeScript + Express** backend — REST API, JWT auth with per-resource ownership checks, centralized error handling, Zod request validation, rate limiting
- **PostgreSQL + Prisma** — a real relational schema (17 tables) with migrations, not hand-created tables
- **Redis + BullMQ** — 8 background job queues, chained into a resumable pipeline; nothing runs an AI/media generation call inside an HTTP request
- **FFmpeg** — a real video renderer that composites per-scene images, narration, and burned-in captions into an MP4, handling scenes/narration of different lengths correctly
- **Provider abstractions** for every external dependency (Claude, OpenArt, TTS, S3-compatible storage, FFmpeg, YouTube), each with a real implementation and a zero-cost mock implementation selected by environment variable — the whole pipeline, video rendering included, runs locally with **zero API keys**
- **Structured AI output** — Claude is never trusted with free-form text; every response is parsed as JSON and validated against a Zod schema, with automatic retry-with-feedback on failure
- A **Character/Visual Bible** system so recurring subjects stay visually consistent across scenes
- **47 passing automated tests** (unit + integration) run against a real local PostgreSQL and Redis — not mocks
- A full generation pipeline **verified end to end in a real browser** (Playwright), including catching and fixing three real bugs along the way (see TESTING.md)

## Quick start

```bash
# 1. Install dependencies (root workspace covers both backend and frontend)
npm install

# 2. Configure environment
cp .env.example .env
# Fill in DATABASE_URL / REDIS_URL for your local Postgres/Redis.
# Every other *_PROVIDER var defaults to "mock" -- no API keys needed to run the full pipeline.

# 3. Set up the database
cd backend
npx prisma migrate dev

# 4. Run it (three processes)
npm run dev            # API server, :4000
npm run dev:worker      # background job workers (separate terminal)
cd ../frontend && npm run dev   # SPA, :5173 (proxies /api to :4000)
```

Visit `http://localhost:5173`, register an account, and create a project. With every provider on `mock`, the entire pipeline — script, scenes, character bible, per-scene images (real synthesized PNGs), narration (real synthesized audio), captions, a real FFmpeg-rendered MP4, and a thumbnail — completes in well under a minute, in the browser, with progress visible live.

To run against real Claude / OpenArt / TTS / S3 / YouTube, see ENVIRONMENT.md for the variables to set and switch the corresponding `*_PROVIDER` value.

## Documentation

| Doc | Covers |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System diagram, folder structure, provider abstractions, state machine, job pipeline, security posture |
| [API.md](./API.md) | Every REST endpoint |
| [DATABASE.md](./DATABASE.md) | Schema, tables, relationships |
| [AI_PIPELINE.md](./AI_PIPELINE.md) | Structured Claude output, validation/retry policy, Character/Visual Bible, pipeline stages |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Cloud deployment plan and steps (not yet executed — see that doc for what's real vs. planned) |
| [ENVIRONMENT.md](./ENVIRONMENT.md) | Every environment variable, required vs. optional |
| [TESTING.md](./TESTING.md) | What's tested, how to run it, what's known-untested |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Common problems and fixes |

## Status: what's real vs. what remains

**Built, implemented, and verified in this environment:**
- The complete backend (schema, migrations, auth, all REST routes, all 8 queues/workers, the state machine, FFmpeg rendering, provider abstractions, usage tracking)
- The complete frontend (every page from the spec, wired to the real API)
- 47 automated tests passing against real local Postgres + Redis
- A full browser-driven pipeline run, register-to-rendered-video, with zero console errors

**Implemented but not exercised against live third-party services** (no credentials were available in this environment): `ClaudeProvider`, `OpenArtProvider`, `TTSProvider`, `YouTubeProvider`, `S3StorageProvider`. The code is written and typechecked against each vendor's real API shape; see AI_PIPELINE.md for the one specific gap (OpenArt's exact endpoint contract) and TESTING.md for the full list.

**Not done, by design:** actual cloud deployment (DEPLOYMENT.md is a plan, not a completed deployment), billing/Stripe integration (only the usage-tracking foundation exists, as specified).
