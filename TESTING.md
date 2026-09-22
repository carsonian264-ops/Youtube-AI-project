# Testing

## What's covered

Backend (Jest + Supertest), run against **real local PostgreSQL and Redis** — no mocked ORM, no mocked queue:

- **Unit**: Zod schema validation (`services/ai/schemas.test.ts`), the project state machine including the `PUBLISHING` claim state (`ProjectStateMachine.test.ts`), the mock AI provider's output shape (`MockAIContentProvider.test.ts`), SRT caption timing (`CaptionService.test.ts`), OAuth token encryption round-trip (`crypto.test.ts`), OAuth CSRF-state signing/verification (`services/auth/oauthState.test.ts`), local storage path-containment (`LocalStorageProvider.test.ts`).
- **Integration — auth**: register/login/me, duplicate email conflict (including a duplicate that only differs by case), case-insensitive login, wrong-password rejection without leaking whether the email exists, malformed token rejection (`tests/integration/auth.test.ts`).
- **Integration — projects & ownership**: project CRUD, **user isolation** (user B cannot read/update/delete user A's project, gets 403; a nonexistent id gets 404, not 403; a project list only returns the caller's own rows), illegal-regenerate-while-in-progress rejection (`tests/integration/projects.test.ts`).
- **Integration — cross-resource ownership**: the same isolation guarantee for scenes, assets, and jobs, which are reached by an id that doesn't directly carry a `userId` and must be joined through their project (`tests/integration/resourceOwnership.test.ts`).
- **Integration — real queue processing**: a real BullMQ `Worker` against real Redis, exercising the actual content-generation job end to end (enqueue → `Job` row `PENDING` → worker picks it up → `Script`/`Scene`/`Character` rows persisted → `Job` row `COMPLETED`), plus an idempotency test proving a duplicate `idempotencyKey` reuses the same job instead of creating a second one (`tests/integration/contentGenerationQueue.test.ts`).
- **Integration — concurrency guards**: real concurrent requests against the real database proving `JobService.create()` collapses N racing calls sharing an `idempotencyKey` into exactly one row, and `ProjectService.transitionStatusIfCurrent()` lets exactly one of N racing compare-and-swap attempts win (`tests/integration/concurrency.test.ts`) — see ARCHITECTURE.md's "Fan-in races" section for why these guards exist.

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

## Follow-up code review pass

A dedicated review after the initial build found and fixed several issues that hadn't surfaced in the tests or browser pass above (concurrency bugs need concurrent load to trigger; the CSRF hole needed someone looking specifically for missing state validation on an unauthenticated route):

- **OAuth CSRF / account-linking** (security): the YouTube `state` parameter was the raw user id with nothing verifying who initiated the flow. Fixed with a signed, short-lived JWT state (`services/auth/oauthState.ts`, regression-tested in `oauthState.test.ts`).
- **Duplicate cascaded jobs under concurrency**: concurrent sibling jobs (e.g. several scenes' visual-generation jobs finishing within the same instant) could each independently decide "all done, enqueue the next stage" and each enqueue a full duplicate batch. Fixed with deterministic `idempotencyKey`s on every cascaded `enqueueJob()` call, backed by a race-safe `JobService.create()`.
- **`JobService.create()`'s idempotency check itself had a race**: check-then-insert, so concurrent callers sharing a key could all pass the check and the losers would throw an unhandled unique-constraint error. Fixed by catching the constraint violation and returning the winning row instead.
- **Double-publish race**: `POST /youtube/publish` only checked `status === READY_FOR_REVIEW` without atomically claiming it, so two racing requests could both pass and upload the same video to YouTube twice. Fixed with a new `PUBLISHING` project status claimed via compare-and-swap (migration `20260922085554_add_publishing_status`).
- **Publishing auto-retry**: all queues shared `attempts: 3`; for publishing specifically, a transient failure right after a successful upload would trigger an automatic re-upload. Fixed by giving the publishing queue `attempts: 1`.
- **Same read-then-write race in `AuthService.register()`**: concurrent duplicate registrations could both pass the pre-check and the loser would 500 instead of 409. Fixed the same way as `JobService.create()`.
- **Case-sensitive email**: `Foo@Example.com` and `foo@example.com` were different accounts. Fixed by normalizing to lowercase.
- Regression-tested concurrency fixes directly against real Postgres with `Promise.all`-driven concurrent requests rather than only asserting the sequential happy path (`tests/integration/concurrency.test.ts`).

## What is not tested

- The real `ClaudeProvider`, `OpenArtProvider`, `TTSProvider`, and `YouTubeProvider` implementations were **not** exercised against live third-party APIs (no credentials were available in this environment). Their request/response handling is implemented and typechecked, but only the mock implementations (which the whole pipeline runs against by default) have been executed. See AI_PIPELINE.md for the one known gap (OpenArt's exact endpoint shape).
- S3-compatible storage (`S3StorageProvider`) was not exercised against a real bucket.
- No load/performance testing.
