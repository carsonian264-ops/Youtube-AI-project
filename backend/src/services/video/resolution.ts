import type { RenderAspectRatio } from "./VideoRenderer";

/**
 * Shared by FFmpegRenderer (to size the actual video) and the caption
 * worker (ASS captions declare PlayResX/PlayResY so font sizes and
 * positions match the video's real pixel dimensions instead of some
 * arbitrary default canvas). Kept in one place so the two never drift.
 */
export const RESOLUTION: Record<RenderAspectRatio, { width: number; height: number }> = {
  LANDSCAPE_16_9: { width: 1920, height: 1080 },
  PORTRAIT_9_16: { width: 1080, height: 1920 },
  SQUARE_1_1: { width: 1080, height: 1080 },
};
