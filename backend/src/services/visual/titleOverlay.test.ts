import { spawn } from "node:child_process";
import { env } from "@/config/env";
import { addTitleOverlay } from "./titleOverlay";

/** A minimal real PNG, generated with the same ffmpeg testsrc technique MockVisualGenerationProvider uses. */
function renderBasePng(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const args = ["-y", "-f", "lavfi", "-i", "color=c=navy:s=320x180", "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"];
    const proc = spawn(env.FFMPEG_PATH, args);
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (chunk) => chunks.push(chunk));
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("addTitleOverlay (real ffmpeg)", () => {
  let basePng: Buffer;

  beforeAll(async () => {
    basePng = await renderBasePng();
  });

  it.each([
    ["a plain title", "Poche Performance"],
    ["a colon and comma", "Wi-Fi Explained: It's Complicated, Really"],
    ["quotes and brackets", 'Has "quotes" and [brackets]'],
    ["a percent sign", "100% Real"],
  ])("composites %s without throwing and returns a valid PNG", async (_label, title) => {
    const result = await addTitleOverlay(basePng, "image/png", title);
    expect(result.mimeType).toBe("image/png");
    expect(result.data.subarray(0, 4)).toEqual(PNG_MAGIC);
    // The overlay should actually change the pixels (not silently no-op) --
    // a resulting file identical in size to the untouched input would be
    // suspicious for a solid-color base image with text drawn on it.
    expect(result.data.length).not.toBe(basePng.length);
  });

  it("falls back to the original bytes and mimeType when ffmpeg can't process the input", async () => {
    const garbage = Buffer.from("not an image");
    const result = await addTitleOverlay(garbage, "image/jpeg", "Doesn't matter");
    expect(result.data).toEqual(garbage);
    expect(result.mimeType).toBe("image/jpeg");
  });
});
