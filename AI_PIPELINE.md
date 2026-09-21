# AI Pipeline

## Provider abstraction

The backend never calls the Anthropic SDK (or any vendor SDK) outside of `backend/src/services/*/`. Every caller depends on an interface:

- `AIContentProvider` (`services/ai/AIContentProvider.ts`) — implemented by `ClaudeProvider` (real) and `MockAIContentProvider` (deterministic, zero-cost, used by default and in tests)
- `VisualGenerationProvider`, `VoiceGenerationProvider`, `StorageProvider`, `VideoRenderer`, `PublishingProvider` — same pattern

`backend/src/services/providers.ts` is the single composition root that decides which implementation to hand out, based on `AI_PROVIDER` / `VISUAL_PROVIDER` / `VOICE_PROVIDER` / `STORAGE_PROVIDER` / `PUBLISHING_PROVIDER`.

## Structured output contract

Claude is never trusted to return "a paragraph we parse with regex." Every AI call:

1. Sends a system prompt instructing **JSON only, no markdown fences, no prose**.
2. Parses the response as JSON.
3. Validates it against a Zod schema in `backend/src/services/ai/schemas.ts`:
   - `ProjectPlanSchema` — title, concept, audience, tone, duration, `scenes[]`
   - `SceneSchema` — sceneNumber, title, narration, visualDescription, visualPrompt, cameraDirection, durationSeconds, soundEffects[], transition
   - `CharacterBibleSchema` — recurring characters/subjects with appearance, clothing, style, palette, environment
   - `YoutubeMetadataSchema` — title/description/tags within YouTube's length limits
   - `QualityCheckSchema` — passed/score/issues[]/summary
4. On JSON-parse failure or schema-validation failure, retries up to 3 attempts total, **feeding the validation error back into the prompt** so the model can self-correct.
5. If all attempts fail, throws `AIResponseValidationError` (HTTP 502) rather than persisting malformed data — the job is marked `FAILED` with the validation error attached, and the project's failure is visible to the user.

See `ClaudeProvider.requestStructured()` for the implementation of this loop.

## Character/Visual Bible

After a script is generated, a second Claude call extracts every recurring character/subject into a `CharacterBible`. Every subsequent scene-image prompt (`visualGeneration.worker.ts`) appends a style-reference string built from these entries (visual style, palette, environment) so scenes stay visually consistent instead of each image being generated in isolation.

## Pipeline stages and jobs

`POST /api/projects/:id/generate` runs the entire pipeline as a chain of BullMQ jobs (see AI_PIPELINE stage table below and ARCHITECTURE.md for the full diagram). Each stage persists its output before the next stage is enqueued, which is what makes a failure resumable: if `video-rendering` fails, the script, scenes, images, and narration already exist in the database/storage and don't need to be regenerated.

| Stage | Queue | What it calls |
|---|---|---|
| Script + scene breakdown + character bible | `content-generation` | `AIContentProvider.generateProjectPlan`, `.generateCharacterBible` |
| Per-scene image | `visual-generation` | `VisualGenerationProvider.generateImage` |
| Per-scene narration | `voice-generation` | `VoiceGenerationProvider.generateSpeech` |
| Captions (SRT) | `caption-generation` | `CaptionService.buildSrt` (derived from narration + timing, no AI call) |
| Thumbnail | `thumbnail-generation` | `VisualGenerationProvider.generateImage` |
| Final video | `video-rendering` | `VideoRenderer.render` (FFmpeg) |
| Quality check | `quality-check` | `AIContentProvider.runQualityCheck` |
| Publish (explicit, user-confirmed only) | `publishing` | `PublishingProvider.publish` |

A single scene can also be regenerated independently (`POST /api/scenes/:id/regenerate`, `/visual`, `/voice`) without touching the rest of the project.

## Cost/usage tracking

Every Claude call, image generation, voice generation, render, and YouTube upload writes a `UsageRecord` (`services/usage/UsageService.ts`) — token counts for Claude come directly from the Anthropic API response's `usage` field. This is deliberately just a ledger; no billing logic exists yet (see spec section 23).

## Known limitation: OpenArt endpoint shape

`OpenArtProvider` implements a generic create-job / poll / download-result flow that was **not verified against a live OpenArt account** (no API key was available in this environment). Before using `VISUAL_PROVIDER=openart` in production, confirm the exact endpoint paths and JSON field names against OpenArt's current API reference and adjust `createGenerationJob`/`pollGenerationJob` in `services/visual/OpenArtProvider.ts` if needed — nothing else in the app depends on those details, since everything else talks to `VisualGenerationProvider`.
