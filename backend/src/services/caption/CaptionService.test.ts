import { captionService } from "./CaptionService";

describe("CaptionService.buildSrt", () => {
  it("wraps long narration into multiple short, readable blocks instead of one wall of text", () => {
    const narration =
      "This is a much longer piece of narration than a single caption line should ever hold, " +
      "because real subtitles need to be broken up into short readable chunks for viewers.";
    const srt = captionService.buildSrt([{ sceneNumber: 1, narration, durationSeconds: 20 }]);

    const blocks = srt.trim().split("\n\n");
    expect(blocks.length).toBeGreaterThan(1);
    for (const block of blocks) {
      const lines = block.split("\n").slice(2); // drop index + timestamp line
      expect(lines.length).toBeLessThanOrEqual(2);
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(42);
      }
    }
  });

  it("times blocks proportionally to their length and keeps them contiguous within a scene", () => {
    const narration =
      "This is a short intro sentence for the hook of the video that keeps going a bit longer, " +
      "just to be sure we get more than one full caption block out of the wrapping logic.";
    const srt = captionService.buildSrt([{ sceneNumber: 1, narration, durationSeconds: 10 }]);
    const blocks = srt.trim().split("\n\n");
    expect(blocks.length).toBeGreaterThan(1);

    const timestamps = blocks.map((b) => b.split("\n")[1] ?? "");
    for (let i = 1; i < timestamps.length; i++) {
      const prevEnd = timestamps[i - 1]?.split(" --> ")[1];
      const currentStart = timestamps[i]?.split(" --> ")[0];
      expect(currentStart).toBe(prevEnd);
    }
  });

  it("advances the next scene's start time to (at least) the previous scene's duration", () => {
    const srt = captionService.buildSrt([
      { sceneNumber: 1, narration: "First", durationSeconds: 3 },
      { sceneNumber: 2, narration: "Second", durationSeconds: 5 },
    ]);
    expect(srt).toContain("00:00:00,000 --> 00:00:03,000\nFirst");
    expect(srt).toContain("00:00:03,000 --> 00:00:08,000\nSecond");
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

  it("clamps a zero/negative duration up to at least the minimum block time", () => {
    const srt = captionService.buildSrt([{ sceneNumber: 1, narration: "x", durationSeconds: 0 }]);
    expect(srt).toContain("00:00:00,000 --> 00:00:01,200");
  });

  it("enforces a minimum on-screen time per block even for very short narration", () => {
    const srt = captionService.buildSrt([{ sceneNumber: 1, narration: "Hi", durationSeconds: 0.1 }]);
    expect(srt).toContain("00:00:00,000 --> 00:00:01,200\nHi");
  });

  it("skips scenes with empty narration but still advances the timing cursor", () => {
    const srt = captionService.buildSrt([
      { sceneNumber: 1, narration: "   ", durationSeconds: 4 },
      { sceneNumber: 2, narration: "Next scene", durationSeconds: 2 },
    ]);
    expect(srt).toContain("00:00:04,000 --> 00:00:06,000\nNext scene");
  });

  it("numbers blocks sequentially across scenes", () => {
    const srt = captionService.buildSrt([
      { sceneNumber: 1, narration: "First scene narration text", durationSeconds: 3 },
      { sceneNumber: 2, narration: "Second scene narration text", durationSeconds: 3 },
    ]);
    const indices = srt
      .trim()
      .split("\n\n")
      .map((block) => Number(block.split("\n")[0]));
    expect(indices).toEqual(indices.map((_, i) => i + 1));
  });
});
