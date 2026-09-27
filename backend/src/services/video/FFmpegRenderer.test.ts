import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { env } from "@/config/env";
import { runFfmpeg } from "@/utils/ffmpegExec";
import { probeDurationSeconds } from "@/utils/mediaProbe";
import { FFmpegRenderer } from "./FFmpegRenderer";
import type { RenderProjectInput } from "./VideoRenderer";

/**
 * Exercises the real FFmpeg binary end to end -- no mocking -- because
 * the whole point of this renderer is the exact filtergraph syntax it
 * hands to ffmpeg (zoompan for camera motion, xfade/acrossfade for
 * transitions, sidechaincompress+loudnorm for audio). A unit test that
 * mocked ffmpeg out would only prove the mock was called correctly, not
 * that the actual command works, which is exactly the class of bug this
 * feature already ran into once during manual testing.
 */
function probeStreams(filePath: string): Promise<{ hasVideo: boolean; hasAudio: boolean; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const args = ["-v", "error", "-show_entries", "stream=codec_type,width,height", "-of", "json", filePath];
    const proc = spawn(env.FFPROBE_PATH, args);
    let stdout = "";
    proc.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}`));
      const parsed = JSON.parse(stdout) as { streams: { codec_type: string; width?: number; height?: number }[] };
      const video = parsed.streams.find((s) => s.codec_type === "video");
      resolve({
        hasVideo: Boolean(video),
        hasAudio: parsed.streams.some((s) => s.codec_type === "audio"),
        width: video?.width ?? 0,
        height: video?.height ?? 0,
      });
    });
  });
}

async function makeTestImage(dir: string, color: string): Promise<string> {
  const outPath = path.join(dir, `${color}.png`);
  await runFfmpeg(["-y", "-f", "lavfi", "-i", `color=c=${color}:s=640x360`, "-frames:v", "1", outPath]);
  return outPath;
}

async function makeTestAudio(dir: string, name: string, frequency: number, durationSeconds: number): Promise<string> {
  const outPath = path.join(dir, `${name}.wav`);
  await runFfmpeg(["-y", "-f", "lavfi", "-i", `sine=frequency=${frequency}:duration=${durationSeconds}`, outPath]);
  return outPath;
}

describe("FFmpegRenderer (real ffmpeg)", () => {
  let workDir: string;
  const renderer = new FFmpegRenderer();

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), "renderer-test-"));
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it("renders 3 scenes with camera motion and transitions into one valid MP4, shorter than the naive sum of scene durations", async () => {
    const [imgA, imgB, imgC] = await Promise.all([makeTestImage(workDir, "red"), makeTestImage(workDir, "green"), makeTestImage(workDir, "blue")]);
    const [audioA, audioB, audioC] = await Promise.all([
      makeTestAudio(workDir, "a", 300, 2),
      makeTestAudio(workDir, "b", 500, 1.5),
      makeTestAudio(workDir, "c", 700, 2),
    ]);

    const outputPath = path.join(workDir, "final.mp4");
    const input: RenderProjectInput = {
      aspectRatio: "LANDSCAPE_16_9",
      outputPath,
      scenes: [
        { visualPath: imgA, audioPath: audioA, durationSeconds: 2, cameraMotion: "ZOOM_IN", transitionOut: "CROSSFADE" },
        { visualPath: imgB, audioPath: audioB, durationSeconds: 1.5, cameraMotion: "PAN_RIGHT", transitionOut: "HARD_CUT" },
        { visualPath: imgC, audioPath: audioC, durationSeconds: 2, cameraMotion: "STATIC", transitionOut: "FADE_BLACK" },
      ],
    };

    const result = await renderer.render(input);

    await fs.access(outputPath);
    const streams = await probeStreams(outputPath);
    expect(streams.hasVideo).toBe(true);
    expect(streams.hasAudio).toBe(true);
    expect(streams.width).toBe(1920);
    expect(streams.height).toBe(1080);

    // Naive sum (2 + 1.5 + 2 = 5.5s) minus the two transition overlaps
    // (0.5s crossfade + 0.001s hard-cut, plus the outro fade doesn't
    // shorten anything -- it fades within the existing tail). Allow
    // generous slack for encoder rounding.
    expect(result.durationSeconds).toBeGreaterThan(4.5);
    expect(result.durationSeconds).toBeLessThan(5.4);
  }, 30_000);

  it("still produces a valid, normalized-audio MP4 with a single scene (no transitions to apply)", async () => {
    const img = await makeTestImage(workDir, "yellow");
    const audio = await makeTestAudio(workDir, "solo", 440, 3);
    const outputPath = path.join(workDir, "single.mp4");

    const result = await renderer.render({
      aspectRatio: "SQUARE_1_1",
      outputPath,
      scenes: [{ visualPath: img, audioPath: audio, durationSeconds: 3, cameraMotion: "ZOOM_OUT" }],
    });

    await fs.access(outputPath);
    const streams = await probeStreams(outputPath);
    expect(streams.hasVideo).toBe(true);
    expect(streams.hasAudio).toBe(true);
    expect(streams.width).toBe(1080);
    expect(streams.height).toBe(1080);
    expect(result.durationSeconds).toBeGreaterThan(2.8);
  }, 20_000);

  it("mixes background music with ducking without breaking sync or duration", async () => {
    const img = await makeTestImage(workDir, "cyan");
    const audio = await makeTestAudio(workDir, "narration", 300, 4);
    const music = await makeTestAudio(workDir, "music", 150, 6);
    const outputPath = path.join(workDir, "with-music.mp4");

    const result = await renderer.render({
      aspectRatio: "LANDSCAPE_16_9",
      outputPath,
      musicPath: music,
      scenes: [{ visualPath: img, audioPath: audio, durationSeconds: 4, cameraMotion: "STATIC" }],
    });

    await fs.access(outputPath);
    const finalDuration = await probeDurationSeconds(outputPath);
    expect(finalDuration).toBeGreaterThan(3.5);
    expect(finalDuration).toBeLessThan(4.5);
    expect(result.durationSeconds).toBeGreaterThan(3.5);
  }, 20_000);
});
