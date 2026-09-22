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

## Second follow-up review pass

A further review pass focused on the parts of the system that only misbehave under a transient failure + automatic retry, which the happy-path browser/integration tests above don't exercise:

- **Premature project-FAILED on a retryable error** (the most significant finding of this pass): every queue worker's catch block unconditionally moved the owning project to `FAILED` on the *first* error, before BullMQ's own `attempts: 3` retry had a chance to run. Since `ProjectStateMachine` only lets `FAILED` go back to `PLANNING`/`CANCELLED`, a retry that then *succeeded* would try to advance the project to its real next status and hit an illegal transition, permanently wedging a pipeline stage that a plain automatic retry should have silently recovered from. Fixed by adding `queues/retry.ts`'s `isLastAttempt(bullJob)` (mirrors BullMQ's own `attemptsMade + 1 < opts.attempts` retry decision) and gating every worker's terminal status transition — and the `Job.status`/`willRetry` flag passed to `JobService.markFailed()`, previously hardcoded `false` everywhere — behind it. Regression-tested in `queues/retry.test.ts`. `contentGeneration.worker.ts`'s multi-checkpoint `processFullPlan` additionally treats an illegal checkpoint transition as a skippable no-op (`advanceStatus()`) rather than a hard failure, since a retry resuming from a later checkpoint than a previous attempt reached is otherwise still unable to move forward at all.
- **`S3StorageProvider` inconsistent with every other provider**: it was the only provider implementation that didn't wrap upstream (AWS SDK) errors as `ProviderError`, so a real S3 failure would have surfaced as an opaque, untyped 500 instead of the safe 502 the rest of the app gives upstream failures. Also, `resolveLocalPath()` downloads objects to `os.tmpdir()` for FFmpeg/YouTube upload access but nothing ever deleted them — a slow disk leak on any deployment actually using S3 storage. Fixed: all methods now wrap SDK errors as `ProviderError`, and `resolveLocalPath()` opportunistically sweeps its own temp files older than an hour on every call, bounding the leak without requiring every caller to coordinate cleanup.
- **`cancelPendingJobsForProject` could clobber a completed job to `CANCELLED`**: an unconditional status update raced against a job that had just completed. Fixed with a guarded `updateMany({ where: { status: "PENDING" } })`.
- **`ProjectService.delete()` allowed deleting a project mid-YouTube-upload**, orphaning a live publish. Fixed with a `PUBLISHING` guard.
- **OAuth consent denial crashed into a generic 500** instead of redirecting back with a clear message, because `client.getToken(undefined)` was called before checking Google's `?error=` param. Fixed in `oauthCallback`.
- **The frontend never read the OAuth redirect result at all**: `Settings.tsx` had no handler for `?youtube=connected|denied|error`, so a user had no idea whether connecting a channel worked. Fixed with a `useEffect` that shows a toast and cleans up the URL.
- **`qualityCheck.worker.ts` could clobber an already-`COMPLETED` job back to `FAILED`** when manually re-triggered from a state where its own success path's transition was no longer legal, because no route-level or worker-level check tied the trigger to a state where success was guaranteed to be reachable. Fixed by gating both the controller (`runQualityCheck`) and the worker's terminal transition on the project actually still being in a compatible state, and updating the matching frontend button condition.

## What is not tested

- The real `ClaudeProvider`, `OpenArtProvider`, `TTSProvider`, and `YouTubeProvider` implementations were **not** exercised against live third-party APIs (no credentials were available in this environment). Their request/response handling is implemented and typechecked, but only the mock implementations (which the whole pipeline runs against by default) have been executed. See AI_PIPELINE.md for the one known gap (OpenArt's exact endpoint shape).
- S3-compatible storage (`S3StorageProvider`) was not exercised against a real bucket.
- No load/performance testing.
