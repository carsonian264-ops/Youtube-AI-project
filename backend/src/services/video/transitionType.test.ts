import { parseTransition, scaledXfadeDuration, XFADE_CONFIG } from "./transitionType";

describe("parseTransition", () => {
  it.each([
    ["cut", "HARD_CUT"],
    ["hard cut", "HARD_CUT"],
    ["fade-to-black", "FADE_BLACK"],
    ["dip to black", "FADE_BLACK"],
    ["fade to white", "FADE_WHITE"],
    ["crossfade", "CROSSFADE"],
    ["dissolve", "CROSSFADE"],
    ["fade", "CROSSFADE"],
  ])("parses %s as %s", (text, expected) => {
    expect(parseTransition(text)).toBe(expected);
  });

  it.each([null, undefined, "", "some unrecognized text"])("defaults unrecognized/empty %p to CROSSFADE, not a hard cut", (text) => {
    expect(parseTransition(text)).toBe("CROSSFADE");
  });

  it("is case-insensitive", () => {
    expect(parseTransition("HARD CUT")).toBe("HARD_CUT");
  });

  it.each([null, undefined, "", "some unrecognized text"])("uses a custom fallback for unrecognized/empty %p when given one", (text) => {
    expect(parseTransition(text, "HARD_CUT")).toBe("HARD_CUT");
  });

  it("still honors an explicit recognizable transition over the custom fallback", () => {
    expect(parseTransition("fade to black", "HARD_CUT")).toBe("FADE_BLACK");
  });
});

describe("scaledXfadeDuration", () => {
  it("scales CROSSFADE/FADE_BLACK/FADE_WHITE proportionally", () => {
    expect(scaledXfadeDuration("CROSSFADE", 2)).toBeCloseTo(1.0);
    expect(scaledXfadeDuration("CROSSFADE", 0.5)).toBeCloseTo(0.25);
  });

  it("never scales HARD_CUT, to avoid reintroducing the near-zero xfade truncation bug", () => {
    expect(scaledXfadeDuration("HARD_CUT", 0.1)).toBe(XFADE_CONFIG.HARD_CUT.durationSeconds);
    expect(scaledXfadeDuration("HARD_CUT", 5)).toBe(XFADE_CONFIG.HARD_CUT.durationSeconds);
  });
});

describe("XFADE_CONFIG", () => {
  it("gives HARD_CUT a short but non-zero duration (a true zero breaks xfade's frame accounting)", () => {
    expect(XFADE_CONFIG.HARD_CUT.durationSeconds).toBeGreaterThan(0);
    expect(XFADE_CONFIG.HARD_CUT.durationSeconds).toBeLessThan(0.1);
  });

  it("has a config entry for every TransitionType", () => {
    expect(Object.keys(XFADE_CONFIG).sort()).toEqual(["CROSSFADE", "FADE_BLACK", "FADE_WHITE", "HARD_CUT"]);
  });
});
