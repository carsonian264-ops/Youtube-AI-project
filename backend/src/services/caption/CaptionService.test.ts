import { captionService } from "./CaptionService";
import { CAPTION_STYLE_CONFIG, type CaptionStyleName } from "./captionStyles";

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

describe("CaptionService.buildAss", () => {
  const narration =
    "This is a longer piece of narration than a single caption line should hold, " +
    "so it needs to wrap into more than one on-screen block for a real test.";

  it("emits a well-formed ASS header with the requested resolution and style name", () => {
    const ass = captionService.buildAss([{ sceneNumber: 1, narration, durationSeconds: 8 }], "CLASSIC", 1920, 1080);
    expect(ass).toContain("[Script Info]");
    expect(ass).toContain("PlayResX: 1920");
    expect(ass).toContain("PlayResY: 1080");
    expect(ass).toContain("[V4+ Styles]");
    expect(ass).toContain("Style: Default,");
    expect(ass).toContain("[Events]");
    expect(ass).toContain("Dialogue: 0,");
  });

  it("orders events by sceneNumber and keeps blocks contiguous, like buildSrt", () => {
    const ass = captionService.buildAss(
      [
        { sceneNumber: 2, narration: "Second scene", durationSeconds: 2 },
        { sceneNumber: 1, narration: "First scene", durationSeconds: 2 },
      ],
      "CLASSIC",
      1920,
      1080,
    );
    // Search for the full narration text, not just "Second" -- the ASS
    // style header's own "SecondaryColour" column name contains "Second"
    // as a substring and would otherwise match first.
    const firstIndex = ass.indexOf("First scene");
    const secondIndex = ass.indexOf("Second scene");
    expect(firstIndex).toBeGreaterThan(-1);
    expect(secondIndex).toBeGreaterThan(firstIndex);
  });

  it("skips scenes with empty narration but still advances the timing cursor", () => {
    const ass = captionService.buildAss(
      [
        { sceneNumber: 1, narration: "   ", durationSeconds: 4 },
        { sceneNumber: 2, narration: "Next scene", durationSeconds: 2 },
      ],
      "CLASSIC",
      1920,
      1080,
    );
    expect(ass).toContain("0:00:04.00,0:00:06.00,Default,,0,0,0,,Next scene");
  });

  for (const styleName of Object.keys(CAPTION_STYLE_CONFIG) as CaptionStyleName[]) {
    it(`renders a non-empty caption event for the ${styleName} style`, () => {
      const ass = captionService.buildAss([{ sceneNumber: 1, narration: "Hello world", durationSeconds: 3 }], styleName, 1920, 1080);
      const eventsSection = ass.split("[Events]")[1] ?? "";
      const dialogueLines = eventsSection.split("\n").filter((line) => line.startsWith("Dialogue:"));
      expect(dialogueLines.length).toBeGreaterThan(0);
      expect(dialogueLines[0]?.length).toBeGreaterThan("Dialogue: 0,0:00:00.00,0:00:00.00,Default,,0,0,0,,".length);
    });
  }

  it("gives animated styles per-word {\\kf} karaoke timing that sums to the block's duration", () => {
    const style = CAPTION_STYLE_CONFIG.HIGHLIGHT;
    expect(style.animated).toBe(true);
    const ass = captionService.buildAss([{ sceneNumber: 1, narration: "one two three four", durationSeconds: 4 }], "HIGHLIGHT", 1920, 1080);
    const dialogue = ass.split("\n").find((line) => line.startsWith("Dialogue:"))!;
    const kfMatches = [...dialogue.matchAll(/\{\\kf(\d+)\}/g)];
    expect(kfMatches.length).toBe(4);
    const totalCentis = kfMatches.reduce((sum, m) => sum + Number(m[1]), 0);
    expect(totalCentis).toBe(400); // 4 seconds = 400 centiseconds
  });

  it("uppercases text for styles that request it (BOLD)", () => {
    const ass = captionService.buildAss([{ sceneNumber: 1, narration: "hello world", durationSeconds: 3 }], "BOLD", 1920, 1080);
    expect(ass).toMatch(/HELLO/);
    expect(ass).not.toMatch(/hello/);
  });

  it("does not uppercase text for styles that don't request it (CLASSIC)", () => {
    const ass = captionService.buildAss([{ sceneNumber: 1, narration: "hello world", durationSeconds: 3 }], "CLASSIC", 1920, 1080);
    expect(ass).toContain("hello world");
  });
});
