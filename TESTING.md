# Testing

## What's covered

Backend (Jest + Supertest), run against **real local PostgreSQL and Redis** — no mocked ORM, no mocked queue:

- **Unit**: Zod schema validation (`services/ai/schemas.test.ts`), the project state machine (`ProjectStateMachine.test.ts`), the mock AI provider's output shape (`MockAIContentProvider.test.ts`), SRT caption timing (`CaptionService.test.ts`), OAuth token encryption round-trip (`crypto.test.ts`).
- **Integration — auth**: register/login/me, duplicate email conflict, wrong-password rejection without leaking whether the email exists, malformed token rejection (`tests/integration/auth.test.ts`).
- **Integration — projects & ownership**: project CRUD, **user isolation** (user B cannot read/update/delete user A's project, gets 403; a nonexistent id gets 404, not 403; a project list only returns the caller's own rows), illegal-regenerate-while-in-progress rejection (`tests/integration/projects.test.ts`).
- **Integration — cross-resource ownership**: the same isolation guarantee for scenes, assets, and jobs, which are reached by an id that doesn't directly carry a `userId` and must be joined through their project (`tests/integration/resourceOwnership.test.ts`).
- **Integration — real queue processing**: a real BullMQ `Worker` against real Redis, exercising the actual content-generation job end to end (enqueue → `Job` row `PENDING` → worker picks it up → `Script`/`Scene`/`Character` rows persisted → `Job` row `COMPLETED`), plus an idempotency test proving a duplicate `idempotencyKey` reuses the same job instead of creating a second one (`tests/integration/contentGenerationQueue.test.ts`).

Frontend: typechecked (`tsc -b`), linted (ESLint + `react-hooks`), and verified with a real Playwright browser session driving the actual UI — register → create project → run the full generation pipeline against the mock providers → inspect every tab (Script/Scenes/Characters/Assets/Video/Publish) → Projects/Usage/Settings pages — with zero browser console errors. Vitest is wired up (`npm test` in `frontend/`) for component-level tests as the app grows; no component tests exist yet beyond the browser-driven pass.

## Running the backend suite

```bash
cd backend
npm test               # jest --runInBand
```

Requires:
- PostgreSQL reachable at the `ai_content_studio_test` database (`TEST_DATABASE_URL` env var to override; defaults to `postgresql://studio:studio_dev_password@localhost:5432/ai_content_studio_test`)
- Redis reachable at `REDIS_URL` (defaults to `redis://localhost:6379`)

First time setup:
```bash
sudo -u postgres createdb -O studio ai_content_studio_test   # or via your own Postgres client
cd backend
DATABASE_URL=postgresql://studio:studio_dev_password@localhost:5432/ai_content_studio_test npx prisma migrate deploy
npm test
```

`src/tests/setupEnv.ts` sets every other required env var (JWT secrets, mock providers, etc.) for the test process automatically — you don't need a `.env` file to run tests.

### Test isolation note

The test suite's Redis-backed queue tests and any **separately running dev server/worker process** point at the same Redis instance by default (there's no separate Redis DB index for tests). Running `npm run dev:worker` at the same time as `npm test` will cause both to compete for the same BullMQ jobs and produce confusing failures/log noise that have nothing to do with actual bugs. Stop dev processes before running the test suite (or run tests first, dev server after).

## Running the frontend checks

```bash
cd frontend
npm run typecheck
npm run lint
npm run build     # production build must succeed
```

## Manual / browser verification performed

Every screen (Dashboard, Projects, Create Project, Project Workspace — all six tabs, Settings, Usage) was exercised in a real headless Chromium session against the running dev stack (`npm run dev` in both `backend/` and `frontend/`), including a full generate-to-`READY_FOR_REVIEW` run with a real FFmpeg-rendered output video and thumbnail displayed in the Video tab. This caught two real bugs before they shipped:

1. **State machine gap**: `SCRIPT_READY -> SCENES_READY` (and every checkpoint state's path to `FAILED`) was missing, so a real pipeline run got permanently stuck instead of either completing or surfacing a failure. Fixed in `ProjectStateMachine.ts`.
2. **Stale UI**: the workspace page polled a separate `/status` endpoint but never used its result to refresh the displayed data, so the pipeline view never visibly updated even though the backend finished in under a second. Fixed by making `useProject` self-poll the full workspace query while the project is in progress.
3. **Cross-origin media blocked**: Helmet's default `Cross-Origin-Resource-Policy: same-origin` silently blocked the frontend from loading generated images/audio/video served from the backend's `/storage` route. Fixed by scoping the policy to `cross-origin`.

## What is not tested

- The real `ClaudeProvider`, `OpenArtProvider`, `TTSProvider`, and `YouTubeProvider` implementations were **not** exercised against live third-party APIs (no credentials were available in this environment). Their request/response handling is implemented and typechecked, but only the mock implementations (which the whole pipeline runs against by default) have been executed. See AI_PIPELINE.md for the one known gap (OpenArt's exact endpoint shape).
- S3-compatible storage (`S3StorageProvider`) was not exercised against a real bucket.
- No load/performance testing.
