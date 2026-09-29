import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import { env } from "@/config/env";
import { measureAudioDurationSeconds } from "./mediaProbe";

function renderMp3(durationSeconds: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const args = ["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", String(durationSeconds), "-f", "mp3", "pipe:1"];
    const proc = spawn(env.FFMPEG_PATH, args);
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (chunk) => chunks.push(chunk));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

describe("measureAudioDurationSeconds", () => {
  it("measures the real duration of the audio bytes, not a caller-supplied estimate", async () => {
    const data = await renderMp3(3);

    const duration = await measureAudioDurationSeconds(data);

    // This is the whole point of the fix: no VoiceGenerationProvider self-
    // reports duration, so this must come from actually probing the audio.
    expect(duration).toBeGreaterThan(2.5);
    expect(duration).toBeLessThan(3.5);
  });

  it("cleans up its temp file even on success", async () => {
    const before = (await fs.readdir(os.tmpdir())).filter((f) => f.startsWith("audio-probe-"));
    const data = await renderMp3(1);

    await measureAudioDurationSeconds(data);

    const after = (await fs.readdir(os.tmpdir())).filter((f) => f.startsWith("audio-probe-"));
    expect(after.length).toBe(before.length);
  });
});
