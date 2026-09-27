import { CAPTION_STYLE_CONFIG } from "@/services/caption/captionStyles";
import { XFADE_CONFIG } from "./transitionType";
import { VIDEO_STYLE_CONFIG } from "./videoStyle";

const EXPECTED_VIDEO_STYLES = [
  "DOCUMENTARY",
  "CINEMATIC",
  "EDUCATIONAL",
  "TECH",
  "MOTIVATIONAL",
  "STORYTELLING",
  "NEWS",
  "FACELESS_YOUTUBE",
  "SHORT_FORM",
];

describe("VIDEO_STYLE_CONFIG", () => {
  it("has exactly the 9 VideoStyle enum values", () => {
    expect(Object.keys(VIDEO_STYLE_CONFIG).sort()).toEqual([...EXPECTED_VIDEO_STYLES].sort());
  });

  it("every entry points at a real caption style, transition, and a non-empty camera-motion rotation", () => {
    for (const config of Object.values(VIDEO_STYLE_CONFIG)) {
      expect(CAPTION_STYLE_CONFIG[config.captionStyle]).toBeDefined();
      expect(XFADE_CONFIG[config.defaultTransition]).toBeDefined();
      expect(config.cameraMotionRotation.length).toBeGreaterThan(0);
      expect(config.transitionDurationScale).toBeGreaterThan(0);
    }
  });

  it("gives each video style a distinguishable pacing or look (not all identical to CINEMATIC)", () => {
    const cinematic = VIDEO_STYLE_CONFIG.CINEMATIC;
    const distinctCount = Object.entries(VIDEO_STYLE_CONFIG).filter(
      ([name, config]) => name !== "CINEMATIC" && (config.captionStyle !== cinematic.captionStyle || config.transitionDurationScale !== cinematic.transitionDurationScale),
    ).length;
    expect(distinctCount).toBe(Object.keys(VIDEO_STYLE_CONFIG).length - 1);
  });
});
