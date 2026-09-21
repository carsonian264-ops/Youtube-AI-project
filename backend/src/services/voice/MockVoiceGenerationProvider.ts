import { spawn } from "node:child_process";
import { env } from "@/config/env";
import { ProviderError } from "@/utils/errors";
import type { GeneratedAudio, GenerateSpeechInput, VoiceGenerationProvider } from "./VoiceGenerationProvider";

const WORDS_PER_SECOND = 2.5;

/**
 * Zero-cost, zero-network implementation used for local development
 * (VOICE_PROVIDER=mock, the default) and tests. Synthesizes real, valid
 * silent MP3 audio of a duration estimated from word count, so downstream
 * timing/rendering logic can be exercised end-to-end.
 */
export class MockVoiceGenerationProvider implements VoiceGenerationProvider {
  async generateSpeech(input: GenerateSpeechInput): Promise<GeneratedAudio> {
    const wordCount = input.text.trim().split(/\s+/).filter(Boolean).length;
    const durationSeconds = Math.max(1, Math.round(wordCount / WORDS_PER_SECOND));
    const data = await renderSilentAudio(durationSeconds);
    return {
      data,
      mimeType: "audio/mpeg",
      provider: "mock",
      durationSeconds,
      metadata: { wordCount },
    };
  }
}

function renderSilentAudio(durationSeconds: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `anullsrc=r=44100:cl=mono`,
      "-t",
      String(durationSeconds),
      "-f",
      "mp3",
      "pipe:1",
    ];
    const proc = spawn(env.FFMPEG_PATH, args);
    const chunks: Buffer[] = [];
    let stderr = "";
    proc.stdout.on("data", (chunk) => chunks.push(chunk));
    proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    proc.on("error", (err) => reject(new ProviderError("mock-voice", err.message, false)));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new ProviderError("mock-voice", `ffmpeg exited with code ${code}: ${stderr}`, false));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}
