import { spawn } from "node:child_process";
import { env } from "@/config/env";
import { ProviderError } from "@/utils/errors";
import type { GenerateImageInput, GeneratedMedia, VisualGenerationProvider } from "./VisualGenerationProvider";

const ASPECT_RATIO_SIZE: Record<GenerateImageInput["aspectRatio"], { width: number; height: number }> = {
  LANDSCAPE_16_9: { width: 1280, height: 720 },
  PORTRAIT_9_16: { width: 720, height: 1280 },
  SQUARE_1_1: { width: 1024, height: 1024 },
};

/**
 * Zero-cost, zero-network implementation used for local development
 * (VISUAL_PROVIDER=mock, the default) and tests. Uses FFmpeg's built-in
 * `testsrc` filter to synthesize a real, valid PNG so downstream code
 * (storage upload, video rendering) can be exercised end-to-end without
 * ever calling OpenArt.
 */
export class MockVisualGenerationProvider implements VisualGenerationProvider {
  async generateImage(input: GenerateImageInput): Promise<GeneratedMedia> {
    const { width, height } = ASPECT_RATIO_SIZE[input.aspectRatio];
    const data = await renderTestImage(width, height);
    return {
      data,
      mimeType: "image/png",
      provider: "mock",
      metadata: { width, height, prompt: input.prompt },
    };
  }
}

function renderTestImage(width: number, height: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `testsrc=size=${width}x${height}:rate=1`,
      "-frames:v",
      "1",
      "-f",
      "image2pipe",
      "-vcodec",
      "png",
      "pipe:1",
    ];
    const proc = spawn(env.FFMPEG_PATH, args);
    const chunks: Buffer[] = [];
    let stderr = "";
    proc.stdout.on("data", (chunk) => chunks.push(chunk));
    proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    proc.on("error", (err) => reject(new ProviderError("mock-visual", err.message, false)));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new ProviderError("mock-visual", `ffmpeg exited with code ${code}: ${stderr}`, false));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}
