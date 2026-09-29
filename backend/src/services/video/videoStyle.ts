import type { VideoStyle } from "@/generated/prisma";
import type { CaptionStyleName } from "@/services/caption/captionStyles";
import type { CameraMotionType } from "./cameraMotion";
import type { TransitionType } from "./transitionType";

export interface VideoStyleConfig {
  captionStyle: CaptionStyleName;
  /** Biases parseCameraMotion's fallback cycle when a scene's own camera direction isn't recognizable. */
  cameraMotionRotation: CameraMotionType[];
  /** Biases parseTransition's fallback when a scene's own transition text isn't recognizable. */
  defaultTransition: TransitionType;
  /** Multiplies each scene-to-scene xfade duration -- >1 lingers, <1 snaps through cuts faster. Never applied to HARD_CUT (see scaledXfadeDuration). */
  transitionDurationScale: number;
}

/**
 * Centralizes every per-VideoStyle default (caption look, camera-motion
 * bias, transition pacing) in one place instead of scattered conditionals
 * across the caption/rendering workers -- the VideoStyle enum in
 * schema.prisma is just the persisted choice; this is where its meaning
 * actually lives. A project's own scene-level AI direction/transition text
 * always wins when recognizable (see parseCameraMotion/parseTransition) --
 * this only governs the fallback for unrecognized or empty text.
 */
export const VIDEO_STYLE_CONFIG: Record<VideoStyle, VideoStyleConfig> = {
  DOCUMENTARY: {
    captionStyle: "CLASSIC",
    cameraMotionRotation: ["ZOOM_IN", "PAN_RIGHT", "ZOOM_OUT", "PAN_LEFT"],
    defaultTransition: "CROSSFADE",
    transitionDurationScale: 1.3,
  },
  CINEMATIC: {
    captionStyle: "CINEMATIC",
    cameraMotionRotation: ["ZOOM_IN", "PAN_RIGHT", "ZOOM_OUT", "PAN_LEFT", "DIAGONAL", "PAN_UP", "PAN_DOWN"],
    defaultTransition: "FADE_BLACK",
    transitionDurationScale: 1.4,
  },
  EDUCATIONAL: {
    captionStyle: "CLASSIC",
    cameraMotionRotation: ["STATIC", "ZOOM_IN", "STATIC", "PAN_RIGHT"],
    defaultTransition: "CROSSFADE",
    transitionDurationScale: 1.0,
  },
  TECH: {
    captionStyle: "MINIMAL",
    cameraMotionRotation: ["ZOOM_IN", "PAN_RIGHT", "PAN_LEFT"],
    defaultTransition: "CROSSFADE",
    transitionDurationScale: 0.9,
  },
  MOTIVATIONAL: {
    captionStyle: "BOLD",
    cameraMotionRotation: ["ZOOM_IN", "ZOOM_OUT", "DIAGONAL"],
    defaultTransition: "CROSSFADE",
    transitionDurationScale: 0.8,
  },
  STORYTELLING: {
    captionStyle: "CREATOR",
    cameraMotionRotation: ["ZOOM_IN", "PAN_RIGHT", "ZOOM_OUT", "PAN_LEFT", "DIAGONAL"],
    defaultTransition: "CROSSFADE",
    transitionDurationScale: 1.1,
  },
  NEWS: {
    captionStyle: "CLASSIC",
    cameraMotionRotation: ["STATIC", "PAN_RIGHT", "STATIC", "PAN_LEFT"],
    defaultTransition: "HARD_CUT",
    transitionDurationScale: 1.0,
  },
  FACELESS_YOUTUBE: {
    captionStyle: "HIGHLIGHT",
    cameraMotionRotation: ["ZOOM_IN", "PAN_RIGHT", "ZOOM_OUT", "PAN_LEFT", "DIAGONAL", "PAN_UP", "PAN_DOWN"],
    defaultTransition: "CROSSFADE",
    transitionDurationScale: 0.9,
  },
  SHORT_FORM: {
    captionStyle: "HIGHLIGHT",
    cameraMotionRotation: ["ZOOM_IN", "ZOOM_OUT", "DIAGONAL"],
    defaultTransition: "HARD_CUT",
    transitionDurationScale: 0.6,
  },
};
