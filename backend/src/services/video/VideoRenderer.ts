export type RenderAspectRatio = "LANDSCAPE_16_9" | "PORTRAIT_9_16" | "SQUARE_1_1";

export interface RenderSceneInput {
  /** Local filesystem path to the scene's still image or video clip. */
  visualPath: string;
  /** Local filesystem path to the scene's narration audio, if any. */
  audioPath?: string;
  /** Scene's planned duration; the renderer extends this to cover narration if it runs longer. */
  durationSeconds: number;
}

export interface RenderProjectInput {
  scenes: RenderSceneInput[];
  /** Local filesystem path to background music, mixed under narration at reduced volume. */
  musicPath?: string;
  /** Local filesystem path to a burned-in SRT caption file. */
  captionsSrtPath?: string;
  aspectRatio: RenderAspectRatio;
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
