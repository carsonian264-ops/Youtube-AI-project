import { CAPTION_STYLE_CONFIG, assColor } from "./captionStyles";

describe("CAPTION_STYLE_CONFIG", () => {
  it("has exactly the 6 named caption styles", () => {
    expect(Object.keys(CAPTION_STYLE_CONFIG).sort()).toEqual(["BOLD", "CINEMATIC", "CLASSIC", "CREATOR", "HIGHLIGHT", "MINIMAL"]);
  });

  it("gives every style a valid ASS alignment (1-9) and non-negative sizing ratios", () => {
    for (const style of Object.values(CAPTION_STYLE_CONFIG)) {
      expect(style.alignment).toBeGreaterThanOrEqual(1);
      expect(style.alignment).toBeLessThanOrEqual(9);
      expect(style.fontSizeRatio).toBeGreaterThan(0);
      expect(style.marginVRatio).toBeGreaterThanOrEqual(0);
      expect([1, 3]).toContain(style.borderStyle);
    }
  });
});

describe("assColor", () => {
  it("converts RRGGBB to ASS's &HAABBGGRR order", () => {
    expect(assColor("FF0000")).toBe("&H000000FF");
    expect(assColor("00FF00")).toBe("&H0000FF00");
    expect(assColor("0000FF")).toBe("&H00FF0000");
  });

  it("encodes a non-zero alpha", () => {
    expect(assColor("000000", 96)).toBe("&H60000000");
  });
});
