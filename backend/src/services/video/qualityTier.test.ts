import { RESOLUTION } from "./resolution";
import { QUALITY_TIER_CONFIG } from "./qualityTier";

describe("QUALITY_TIER_CONFIG", () => {
  it("has exactly the 3 QualityTier enum values", () => {
    expect(Object.keys(QUALITY_TIER_CONFIG).sort()).toEqual(["DRAFT", "HIGH", "STANDARD"]);
  });

  it("keeps STANDARD's resolution identical to the renderer's pre-existing default, so unchanged behavior for anyone not picking a tier", () => {
    expect(QUALITY_TIER_CONFIG.STANDARD.resolution).toEqual(RESOLUTION);
  });

  it("orders CRF from DRAFT (most compressed) to HIGH (least compressed)", () => {
    expect(QUALITY_TIER_CONFIG.DRAFT.crf).toBeGreaterThan(QUALITY_TIER_CONFIG.STANDARD.crf);
    expect(QUALITY_TIER_CONFIG.STANDARD.crf).toBeGreaterThan(QUALITY_TIER_CONFIG.HIGH.crf);
  });

  it("orders resolution from DRAFT (smallest) to HIGH (largest) for every aspect ratio", () => {
    for (const aspectRatio of ["LANDSCAPE_16_9", "PORTRAIT_9_16", "SQUARE_1_1"] as const) {
      const draftPixels = QUALITY_TIER_CONFIG.DRAFT.resolution[aspectRatio].width * QUALITY_TIER_CONFIG.DRAFT.resolution[aspectRatio].height;
      const standardPixels = QUALITY_TIER_CONFIG.STANDARD.resolution[aspectRatio].width * QUALITY_TIER_CONFIG.STANDARD.resolution[aspectRatio].height;
      const highPixels = QUALITY_TIER_CONFIG.HIGH.resolution[aspectRatio].width * QUALITY_TIER_CONFIG.HIGH.resolution[aspectRatio].height;
      expect(draftPixels).toBeLessThan(standardPixels);
      expect(standardPixels).toBeLessThan(highPixels);
    }
  });

  it("keeps every tier's resolution correctly proportioned for its aspect ratio (16:9, 9:16, 1:1)", () => {
    for (const tier of Object.values(QUALITY_TIER_CONFIG)) {
      const landscape = tier.resolution.LANDSCAPE_16_9;
      const portrait = tier.resolution.PORTRAIT_9_16;
      const square = tier.resolution.SQUARE_1_1;
      expect(landscape.width / landscape.height).toBeCloseTo(16 / 9, 1);
      expect(portrait.height / portrait.width).toBeCloseTo(16 / 9, 1);
      expect(square.width).toBe(square.height);
    }
  });

  it("orders audio bitrate from DRAFT (lowest) to HIGH (highest)", () => {
    expect(QUALITY_TIER_CONFIG.DRAFT.audioBitrateKbps).toBeLessThan(QUALITY_TIER_CONFIG.STANDARD.audioBitrateKbps);
    expect(QUALITY_TIER_CONFIG.STANDARD.audioBitrateKbps).toBeLessThan(QUALITY_TIER_CONFIG.HIGH.audioBitrateKbps);
  });
});
