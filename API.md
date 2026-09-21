# API Reference

Base URL: `{BACKEND_URL}/api` (default `http://localhost:4000/api`). All endpoints except `/auth/register`, `/auth/login`, and `/youtube/oauth/callback` require `Authorization: Bearer <token>`.

Error responses always have the shape:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": { } } }
```

## Auth

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/register` | `{ email, password (>=8 chars), name? }` | Returns `{ user, token }` |
| POST | `/auth/login` | `{ email, password }` | Returns `{ user, token }` |
| GET | `/auth/me` | — | Current user profile |

## Projects

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/projects` | `{ title, concept, targetAudience?, tone?, estimatedDurationSeconds?, aspectRatio? }` | Creates a `DRAFT` project |
| GET | `/projects` | — | List the caller's own projects |
| GET | `/projects/:id` | — | Full workspace: project, scripts, scenes, characters, assets, jobs, videos, thumbnails |
| PATCH | `/projects/:id` | `{ title?, targetAudience?, tone?, aspectRatio? }` | |
| DELETE | `/projects/:id` | — | Cascades to all owned rows |
| POST | `/projects/:id/generate` | `{ targetDurationSeconds?, tone? }` | Starts the full pipeline. 202, project must be `DRAFT` or `FAILED` |
| GET | `/projects/:id/status` | — | `{ projectStatus, failureReason, jobs: [...] }` |
| POST | `/projects/:id/script/regenerate` | `{ tone? }` | Re-runs script + scene breakdown + character bible |
| POST | `/projects/:id/render` | `{ aspectRatio? }` | Re-renders the final video from existing scene assets |
| POST | `/projects/:id/quality-check` | — | Runs the AI quality check against the active script |
| POST | `/projects/:id/youtube/publish` | `{ youtubeAccountId, title, description, tags[], visibility, confirmed: true }` | `confirmed` must be `true` (Zod-enforced literal) — this is the only path that can trigger a YouTube upload |

## Scenes

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/scenes/:id/regenerate` | `{ instructions? }` | Rewrites one scene's script in place |
| POST | `/scenes/:id/visual` | — | Regenerates just that scene's image |
| POST | `/scenes/:id/voice` | — | Regenerates just that scene's narration |

## Assets / Jobs

| Method | Path | Notes |
|---|---|---|
| GET | `/assets/:id` | Ownership-checked asset metadata |
| GET | `/jobs/:id` | Ownership-checked job status/progress/error |

## YouTube

| Method | Path | Notes |
|---|---|---|
| GET | `/youtube/oauth/start` | Returns `{ url }` — redirect the user to Google's consent screen |
| GET | `/youtube/oauth/callback` | Google redirects here; not called directly by the frontend |
| GET | `/youtube/accounts` | List connected channels for the caller |
| GET | `/youtube/publishing-jobs/:id` | Status of a specific publish attempt |

## Usage

| Method | Path | Notes |
|---|---|---|
| GET | `/usage` | `[{ type, total }]` summary for the caller |

## Status codes

- `200` / `201` — success
- `202` — accepted, background job started (generate/render/quality-check/regenerate/publish)
- `204` — deleted, no body
- `400` — validation error (Zod)
- `401` — missing/invalid auth token
- `403` — authenticated, but not the resource owner
- `404` — resource does not exist
- `409` — conflict (duplicate email, illegal state transition)
- `429` — rate limited
- `501` — YouTube publishing not configured on this server
- `502` — upstream provider (Claude/OpenArt/TTS/YouTube) failed, or Claude returned output that failed schema validation after retries

See ARCHITECTURE.md for how requests turn into background jobs, and AI_PIPELINE.md for the AI-specific parts of the flow.
