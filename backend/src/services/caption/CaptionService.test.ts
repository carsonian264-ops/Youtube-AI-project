import { captionService } from "./CaptionService";

describe("CaptionService.buildSrt", () => {
  it("produces sequential, non-overlapping timestamps derived from scene durations", () => {
    const srt = captionService.buildSrt([
      { sceneNumber: 1, narration: "First line", durationSeconds: 3 },
      { sceneNumber: 2, narration: "Second line", durationSeconds: 5 },
    ]);

    expect(srt).toContain("1\n00:00:00,000 --> 00:00:03,000\nFirst line");
    expect(srt).toContain("2\n00:00:03,000 --> 00:00:08,000\nSecond line");
  });

  it("orders blocks by sceneNumber regardless of input order", () => {
    const srt = captionService.buildSrt([
      { sceneNumber: 2, narration: "Second", durationSeconds: 2 },
      { sceneNumber: 1, narration: "First", durationSeconds: 2 },
    ]);
    const firstIndex = srt.indexOf("First");
    const secondIndex = srt.indexOf("Second");
    expect(firstIndex).toBeLessThan(secondIndex);
  });

  it("clamps a zero/negative duration up to at least one second", () => {
    const srt = captionService.buildSrt([{ sceneNumber: 1, narration: "x", durationSeconds: 0 }]);
    expect(srt).toContain("00:00:00,000 --> 00:00:01,000");
  });
});
