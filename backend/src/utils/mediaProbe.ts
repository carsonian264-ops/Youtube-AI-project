import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { env } from "@/config/env";
import { ProviderError } from "@/utils/errors";

/** Measures a local audio/video file's real duration in seconds via ffprobe. */
export function probeDurationSeconds(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath];
    const proc = spawn(env.FFPROBE_PATH, args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    proc.on("error", (err) => reject(new ProviderError("ffprobe", err.message, false)));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new ProviderError("ffprobe", `ffprobe exited with code ${code}: ${stderr}`, false));
        return;
      }
      resolve(parseFloat(stdout.trim()) || 0);
    });
  });
}

/**
 * Measures the real duration of in-memory audio bytes. No
 * VoiceGenerationProvider implementation (Edge TTS, Pollinations,
 * ElevenLabs-compatible TTS, Windows SAPI) actually fills in
 * GeneratedAudio.durationSeconds -- only MockVoiceGenerationProvider
 * does, since it already knows the exact silence duration it rendered --
 * so callers that need a real scene duration must measure it directly
 * rather than trust that field.
 */
export async function measureAudioDurationSeconds(data: Buffer): Promise<number> {
  const tmpPath = path.join(os.tmpdir(), `audio-probe-${randomUUID()}.mp3`);
  try {
    await fs.writeFile(tmpPath, data);
    return await probeDurationSeconds(tmpPath);
  } finally {
    await fs.rm(tmpPath, { force: true }).catch(() => undefined);
  }
}
