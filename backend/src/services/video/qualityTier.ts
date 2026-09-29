import type { QualityTier } from "@/generated/prisma";
import { RESOLUTION } from "./resolution";
import type { RenderAspectRatio } from "./VideoRenderer";

export interface QualityTierConfig {
  /** Output pixel dimensions per aspect ratio for this tier. */
  resolution: Record<RenderAspectRatio, { width: number; height: number }>;
  /** libx264 -preset: lower/slower presets trade render time for a smaller file at the same CRF. */
  preset: "ultrafast" | "veryfast" | "slow";
  /** libx264 -crf: lower means less compression/better quality/bigger file. */
  crf: number;
  /** AAC audio bitrate in kbps. */
  audioBitrateKbps: number;
}

/**
 * Centralizes what "quality" actually means for a rendered video, the
 * same pattern as videoStyle.ts: the Project.qualityTier enum in
 * schema.prisma is just the persisted choice, this is where its meaning
 * lives.
 *
 * Resolution intentionally tops out at 1440p for HIGH, not 4K: every
 * visual provider this app supports (mock, Pollinations) generates source
 * images at well below 1080p to begin with, and FFmpegRenderer already
 * upscales them for the Ken Burns effect (see cameraMotion.ts) -- pushing
 * the *output* canvas to 4K on top of that would only upscale a
 * low-resolution source further, producing a bigger file with no real
 * gain in sharpness. STANDARD reuses the resolution this renderer always
 * used before quality tiers existed, so the default behavior (and every
 * FFmpegRenderer test asserting exact output dimensions) is unchanged.
 */
export const QUALITY_TIER_CONFIG: Record<QualityTier, QualityTierConfig> = {
  DRAFT: {
    resolution: {
      LANDSCAPE_16_9: { width: 854, height: 480 },
      PORTRAIT_9_16: { width: 480, height: 854 },
      SQUARE_1_1: { width: 480, height: 480 },
    },
    preset: "ultrafast",
    crf: 30,
    audioBitrateKbps: 96,
  },
  STANDARD: {
    resolution: RESOLUTION,
    preset: "veryfast",
    crf: 23,
    audioBitrateKbps: 128,
  },
  HIGH: {
    resolution: {
      LANDSCAPE_16_9: { width: 2560, height: 1440 },
      PORTRAIT_9_16: { width: 1440, height: 2560 },
      SQUARE_1_1: { width: 1440, height: 1440 },
    },
    preset: "slow",
    crf: 18,
    audioBitrateKbps: 192,
  },
};
