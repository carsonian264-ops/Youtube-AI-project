import { buildZoompanFilter, parseCameraMotion } from "./cameraMotion";

describe("parseCameraMotion", () => {
  it.each([
    ["slow push-in", "ZOOM_IN"],
    ["gentle zoom in on the subject", "ZOOM_IN"],
    ["pull back to reveal the room", "ZOOM_OUT"],
    ["slow zoom out", "ZOOM_OUT"],
    ["pan left across the skyline", "PAN_LEFT"],
    ["pan right", "PAN_RIGHT"],
    ["tilt up to the sky", "PAN_UP"],
    ["tilt down toward the ground", "PAN_DOWN"],
    ["diagonal drift", "DIAGONAL"],
    ["static wide shot", "STATIC"],
    ["fixed camera, no movement", "STATIC"],
  ])("parses %s as %s", (direction, expected) => {
    expect(parseCameraMotion(direction, 0)).toBe(expected);
  });

  it("is case-insensitive", () => {
    expect(parseCameraMotion("SLOW PUSH-IN", 0)).toBe("ZOOM_IN");
  });

  it.each([null, undefined, "", "a beautiful shot of the mountains"])(
    "falls back to a deterministic rotation for unrecognized/empty direction %p",
    (direction) => {
      const first = parseCameraMotion(direction, 3);
      const second = parseCameraMotion(direction, 3);
      expect(first).toBe(second);
      expect(first).not.toBeUndefined();
    },
  );

  it("varies the fallback across scene indices instead of always the same motion", () => {
    const motions = new Set(Array.from({ length: 7 }, (_, i) => parseCameraMotion("", i)));
    expect(motions.size).toBeGreaterThan(1);
  });

  it("cycles through a custom rotation array when given one (video-style bias)", () => {
    const rotation = ["STATIC", "PAN_RIGHT"] as const;
    expect(parseCameraMotion("", 0, [...rotation])).toBe("STATIC");
    expect(parseCameraMotion("", 1, [...rotation])).toBe("PAN_RIGHT");
    expect(parseCameraMotion("", 2, [...rotation])).toBe("STATIC");
  });

  it("recognizable keyword direction still wins over a custom rotation", () => {
    expect(parseCameraMotion("slow push-in", 0, ["STATIC"])).toBe("ZOOM_IN");
  });
});

describe("buildZoompanFilter", () => {
  it("returns null for STATIC (caller falls back to plain scale/crop)", () => {
    expect(buildZoompanFilter("STATIC", 1920, 1080, 30, 5)).toBeNull();
  });

  it.each(["ZOOM_IN", "ZOOM_OUT", "PAN_LEFT", "PAN_RIGHT", "PAN_UP", "PAN_DOWN", "DIAGONAL"] as const)(
    "produces a zoompan filter string for %s",
    (motion) => {
      const filter = buildZoompanFilter(motion, 1920, 1080, 30, 5);
      expect(filter).toContain("zoompan=");
      expect(filter).toContain("s=1920x1080");
      expect(filter).toContain("fps=30");
    },
  );

  it("scales the increment by duration so short and long scenes both complete a full ~15% zoom", () => {
    const shortFilter = buildZoompanFilter("ZOOM_IN", 1920, 1080, 30, 2)!;
    const longFilter = buildZoompanFilter("ZOOM_IN", 1920, 1080, 30, 10)!;
    // 2s @ 30fps = 60 frames, 10s @ 30fps = 300 frames -- the per-frame
    // increment must differ (5x smaller for the longer scene) even though
    // both ramp to the same total 1.15 zoom ceiling.
    expect(shortFilter).toContain("0.15/60");
    expect(longFilter).toContain("0.15/300");
  });
});
