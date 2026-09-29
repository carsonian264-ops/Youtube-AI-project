# AI Pipeline

## Provider abstraction

The backend never calls the Anthropic SDK (or any vendor SDK) outside of `backend/src/services/*/`. Every caller depends on an interface:

- `AIContentProvider` (`services/ai/AIContentProvider.ts`) — implemented by `ClaudeProvider` (real) and `MockAIContentProvider` (deterministic, zero-cost, used by default and in tests)
- `VisualGenerationProvider`, `VoiceGenerationProvider`, `StorageProvider`, `VideoRenderer`, `PublishingProvider` — same pattern

`backend/src/services/providers.ts` is the single composition root that decides which implementation to hand out, based on `AI_PROVIDER` / `VISUAL_PROVIDER` / `VOICE_PROVIDER` / `STORAGE_PROVIDER` / `PUBLISHING_PROVIDER`.

`ClaudeProvider`/`GeminiProvider` are never used directly -- both are wrapped in `FallbackAIContentProvider`, which degrades to `MockAIContentProvider` on a transient failure (a 503/429, or the provider persistently returning invalid JSON) rather than failing the whole pipeline run. A transient `ProviderError` (503/429 -- the request never even got a response) gets one retry after a short delay first, since "currently experiencing high demand" is usually gone within a few seconds; a validation failure skips that extra retry and falls back immediately, since the provider's own internal retry loop (below) already tried the same request up to 3 times.

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

## Hook and call-to-action prompting

`generateProjectPlan`'s prompt used to say nothing beyond "scene numbers start at 1" -- scene 1 (the hook, the part that decides whether anyone keeps watching) and the final scene (the call to action) got no more attention than any other beat, which produced generic openings ("In this video...") and bare "like and subscribe" closers with no actual reason attached.

`backend/src/services/ai/scriptPromptHints.ts` exports `HOOK_PROMPT_HINT` and `CTA_PROMPT_HINT`, shared by `ClaudeProvider` and `GeminiProvider` so the two can't drift apart on wording:

- **Hook** — open with a curiosity gap, a surprising/counterintuitive claim, or a direct question; get to the point in the first sentence.
- **CTA** — end with one specific, concrete ask tied to the exact topic (what to try, what to watch for, what to comment) plus a reason to subscribe, never a bare "like and subscribe."

Both hints are included in `generateProjectPlan`'s prompt (covering the whole script), and conditionally in `regenerateScene`'s prompt (only when the scene being regenerated is actually scene 1 or the last scene -- regenerating a middle beat doesn't need either).

`MockAIContentProvider` (the free, zero-network default) rotates between a few distinct hook/CTA templates keyed off the idea text's length, rather than a single hardcoded line for every project -- the same reasoning as its camera-motion rotation (see `cameraMotion.ts`): a provider that always writes the exact same thing makes it impossible to notice whether hook/CTA quality actually varies, even in local/mock testing.

## Character/Visual Bible

After a script is generated, a second Claude call extracts every recurring character/subject into a `CharacterBible`. Every subsequent scene-image prompt (`visualGeneration.worker.ts`) appends a style-reference string built from these entries (visual style, palette, environment) so scenes stay visually consistent instead of each image being generated in isolation.

## Pipeline stages and jobs

`POST /api/projects/:id/generate` runs the entire pipeline as a chain of BullMQ jobs (see AI_PIPELINE stage table below and ARCHITECTURE.md for the full diagram). Each stage persists its output before the next stage is enqueued, which is what makes a failure resumable: if `video-rendering` fails, the script, scenes, images, and narration already exist in the database/storage and don't need to be regenerated.

| Stage | Queue | What it calls |
|---|---|---|
| Script + scene breakdown + character bible | `content-generation` | `AIContentProvider.generateProjectPlan`, `.generateCharacterBible` |
| Per-scene image | `visual-generation` | `VisualGenerationProvider.generateImage` |
| Per-scene narration | `voice-generation` | `VoiceGenerationProvider.generateSpeech` |
| Captions (ASS) | `caption-generation` | `CaptionService.buildAss` (derived from narration + timing, no AI call) |
| Thumbnail | `thumbnail-generation` | `VisualGenerationProvider.generateImage` |
| Final video | `video-rendering` | `VideoRenderer.render` (FFmpeg) |
| Quality check | `quality-check` | `AIContentProvider.runQualityCheck` |
| Publish (explicit, user-confirmed only) | `publishing` | `PublishingProvider.publish` |

A single scene can also be regenerated independently (`POST /api/scenes/:id/regenerate`, `/visual`, `/voice`) without touching the rest of the project.

## Video rendering (camera motion, transitions, audio mixing)

`FFmpegRenderer` (`backend/src/services/video/FFmpegRenderer.ts`) turns per-scene stills + narration into a single cinematically-edited video, rather than a slideshow of static images joined by hard cuts. Three pieces work together:

**Camera motion** (`services/video/cameraMotion.ts`) — every still image gets a subtle Ken Burns-style zoom/pan (`ZOOM_IN`, `ZOOM_OUT`, `PAN_LEFT/RIGHT/UP/DOWN`, `DIAGONAL`, or `STATIC`) via FFmpeg's `zoompan` filter, driven by `Scene.cameraDirection` (free-form text the AI already writes, e.g. "slow push-in" — `parseCameraMotion` keyword-matches it; unrecognized/empty text falls back to a deterministic per-scene rotation rather than always defaulting to static, so a provider that doesn't vary its wording still produces visually varied output). No new schema field or AI prompt change was needed — `cameraDirection` already existed and was simply unused by the renderer before this.

**Transitions** (`services/video/transitionType.ts`) — scenes are joined with `xfade`/`acrossfade` (crossfade, dip-to-black, dip-to-white, or a very-short hard cut) instead of the old concat-demuxer hard cut, driven by `Scene.transition` (also pre-existing free text, e.g. "fade-to-black", default "cut"). The last scene's transition is treated as an *outro* fade at the very end of the video rather than a scene-to-scene boundary. `concatWithTransitions` chains `xfade` calls across all clips, tracking each transition's cumulative timeline offset since every crossfade shortens the running total.

**Audio mixing** — narration is mixed with background music (when `Project.musicMood != NONE`) using sidechain compression (`sidechaincompress`) so the music audibly ducks under narration and recovers in the gaps, rather than sitting at one flat reduced volume the whole time. The mix is finished with `loudnorm` for consistent output loudness; when there's no music, narration alone still gets a `loudnorm` pass so every video has predictable volume.

Two FFmpeg specifics that took real testing (not just reading the docs) to get right, in case they need touching again:
- `zoompan`'s self-referencing `zoom`/`x`/`y` expressions only advance frame-to-frame when the looped image input has an explicit `-framerate` flag — without it, every output frame is identical (verified by diffing frame hashes, not by eye).
- An `xfade`/`acrossfade` duration near zero (tried 0.001s for the hard-cut case) silently breaks the filter's internal frame accounting and truncates the rest of the chained output by several seconds. 0.05s is short enough to read as a cut but avoids the bug.

## Video styles and dynamic captions

`Project.videoStyle` (an enum: `DOCUMENTARY`, `CINEMATIC`, `EDUCATIONAL`, `TECH`, `MOTIVATIONAL`, `STORYTELLING`, `NEWS`, `FACELESS_YOUTUBE`, `SHORT_FORM`, default `CINEMATIC`, chosen at project creation) is a single user-facing choice that drives three previously-separate things through one config object, `VIDEO_STYLE_CONFIG` (`services/video/videoStyle.ts`), instead of scattered per-style conditionals:

- **Caption style** — which of the 6 named caption looks (below) gets burned in.
- **Camera-motion bias** — which `CameraMotionType`s `parseCameraMotion`'s fallback cycles through when a scene's own `cameraDirection` text isn't recognizable (e.g. `SHORT_FORM` leans on punchy zooms, `NEWS` leans mostly static).
- **Transition pacing** — `parseTransition`'s fallback (e.g. `NEWS`/`SHORT_FORM` default to a hard cut instead of a crossfade) and `transitionDurationScale`, which multiplies every scene-to-scene `xfade` duration (and the outro fade) so e.g. `CINEMATIC` lingers on its dissolves (1.4x) while `SHORT_FORM` snaps through them (0.6x). `HARD_CUT` is never scaled — its duration is already the minimum that avoids the near-zero xfade truncation bug described above, and scaling it down further would reintroduce it.

A scene's own AI-written `cameraDirection`/`transition` text always wins when recognizable; the style only governs what happens when it isn't (or is empty).

### Caption styles (ASS, not SRT)

Captions are generated as ASS (Advanced SubStation Alpha) rather than SRT (`CaptionService.buildAss`, `services/caption/captionStyles.ts`), because ASS can carry per-style font/color/positioning in its own `[V4+ Styles]` section and express word-level timing — something SRT has no way to do. `FFmpegRenderer.burnCaptions` no longer passes a `force_style` override to the `subtitles` filter, since that option would clobber every style property it names across the whole file, flattening every caption style back to one hardcoded look.

Six named styles (`CaptionStyleName` in `captionStyles.ts`), each mapped to one or more video styles:

| Style | Look | Animated (word-by-word `{\kf}` karaoke) |
|---|---|---|
| `CLASSIC` | Plain white, bottom-center — the pre-existing default look | No |
| `CINEMATIC` | Small italic white, positioned higher | No |
| `MINIMAL` | Small, semi-transparent box background, no outline | No |
| `CREATOR` | Bold yellow, bottom-center | Yes |
| `BOLD` | Huge bold uppercase, dead-center screen | Yes |
| `HIGHLIGHT` | Bold green karaoke sweep, bottom-center | Yes |

Animated styles get a `{\kf<centiseconds>}` fill-sweep tag per word (ASS's native karaoke effect: text sweeps from the style's `SecondaryColour` to `PrimaryColour`), with each word's duration allocated proportional to its character length within the same per-block duration budget `buildSrt`/`buildAss` both compute from `wrapNarrationIntoBlocks`/`allocateDurations` — the last word in a block absorbs the rounding remainder so the running total always matches the block's actual on-screen time exactly, the same technique `allocateDurations` already used across whole blocks.

`buildSrt` (plain SRT, no per-style config) is unchanged and still available, but the pipeline itself now always generates ASS.

## Quality/resolution export tiers

`Project.qualityTier` (an enum: `DRAFT`, `STANDARD`, `HIGH`, default `STANDARD`, chosen at project creation) picks the final video's output resolution and encode settings via `QUALITY_TIER_CONFIG` (`services/video/qualityTier.ts`) -- the same "enum is just the persisted choice, the config object is where its meaning lives" pattern as `videoStyle`.

| Tier | Resolution (16:9) | libx264 preset | CRF | Audio bitrate |
|---|---|---|---|---|
| `DRAFT` | 854x480 | `ultrafast` | 30 | 96 kbps |
| `STANDARD` | 1920x1080 | `veryfast` | 23 | 128 kbps |
| `HIGH` | 2560x1440 | `slow` | 18 | 192 kbps |

`STANDARD` is bit-for-bit the same resolution/preset the renderer always used before this feature existed, so a project that doesn't pick a tier renders exactly as it did before.

HIGH intentionally tops out at 1440p, not 4K: every visual provider this app supports (the mock placeholder, Pollinations) generates source images well below 1080p, and `FFmpegRenderer` already upscales them for the Ken Burns effect (see `cameraMotion.ts`) -- rendering the *output* canvas at 4K on top of an already-upscaled low-resolution source would just produce a bigger file with no real gain in sharpness. A lower CRF (less compression) still visibly reduces compression artifacts at the same source resolution, so `HIGH`'s value is genuinely in encode quality, not a resolution number that outruns what the source images can support.

Every FFmpeg stage that re-encodes video (`renderSceneClip`, `concatWithTransitions`, and `burnCaptions` -- which always re-encodes, since burning subtitles isn't a passthrough) applies the tier's `preset`/`crf` explicitly. Before this, `burnCaptions` had no explicit video codec settings at all and silently fell back to ffmpeg's own defaults (preset `medium`, CRF 23) regardless of what the rest of the pipeline used -- since caption burn-in is usually the very last encode, its settings were quietly overriding everything upstream.

## Cost/usage tracking

Every Claude call, image generation, voice generation, render, and YouTube upload writes a `UsageRecord` (`services/usage/UsageService.ts`) — token counts for Claude come directly from the Anthropic API response's `usage` field. This is deliberately just a ledger; no billing logic exists yet (see spec section 23).

## Known limitation: OpenArt endpoint shape

`OpenArtProvider` implements a generic create-job / poll / download-result flow that was **not verified against a live OpenArt account** (no API key was available in this environment). Before using `VISUAL_PROVIDER=openart` in production, confirm the exact endpoint paths and JSON field names against OpenArt's current API reference and adjust `createGenerationJob`/`pollGenerationJob` in `services/visual/OpenArtProvider.ts` if needed — nothing else in the app depends on those details, since everything else talks to `VisualGenerationProvider`.
