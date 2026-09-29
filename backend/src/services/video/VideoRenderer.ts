import type { CameraMotionType } from "./cameraMotion";
import type { TransitionType } from "./transitionType";

export type RenderAspectRatio = "LANDSCAPE_16_9" | "PORTRAIT_9_16" | "SQUARE_1_1";
export type RenderQualityTier = "DRAFT" | "STANDARD" | "HIGH";

export interface RenderSceneInput {
  /** Local filesystem path to the scene's still image or video clip. */
  visualPath: string;
  /** Local filesystem path to the scene's narration audio, if any. */
  audioPath?: string;
  /** Scene's planned duration; the renderer extends this to cover narration if it runs longer. */
  durationSeconds: number;
  /** Local filesystem paths to short sound-effect accents, mixed in at the start of the scene. */
  soundEffectPaths?: string[];
  /** Ken Burns-style motion applied to the still image; defaults to STATIC (unchanged pre-existing behavior). */
  cameraMotion?: CameraMotionType;
  /** Transition used leaving this scene for the next one (or, on the last scene, leaving the video). Defaults to CROSSFADE. */
  transitionOut?: TransitionType;
}

export interface RenderProjectInput {
  scenes: RenderSceneInput[];
  /** Local filesystem path to background music, mixed under narration at reduced volume. */
  musicPath?: string;
  /** Local filesystem path to a burned-in caption file (ASS, carrying its own per-style look -- see captionStyles.ts). */
  captionsPath?: string;
  aspectRatio: RenderAspectRatio;
  /** Multiplies every scene-to-scene transition's duration; see videoStyle.ts. Defaults to 1 (unchanged pacing). */
  transitionDurationScale?: number;
  /** Output resolution + encode settings; see qualityTier.ts. Defaults to STANDARD (unchanged pre-existing behavior). */
  qualityTier?: RenderQualityTier;
  /** Where to write the final MP4. */
  outputPath: string;
}

export interface RenderResult {
  outputPath: string;
  durationSeconds: number;
  width: number;
  height: number;
}

/**
 * Abstraction over "combine scenes/narration/music/captions into one
 * final video file". The only real implementation is FFmpegRenderer, but
 * keeping this as an interface means an alternative renderer (a cloud
 * rendering API, for example) could be swapped in without touching the
 * queue/worker code that calls it.
 */
export interface VideoRenderer {
  render(input: RenderProjectInput): Promise<RenderResult>;
}
