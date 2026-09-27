import { parseTransition, XFADE_CONFIG } from "./transitionType";

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
