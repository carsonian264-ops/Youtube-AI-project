import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { env } from "@/config/env";
import { ProviderError } from "@/utils/errors";
import type { GeneratedAudio, GenerateSpeechInput, VoiceGenerationProvider } from "./VoiceGenerationProvider";

/**
 * Fully offline implementation of VoiceGenerationProvider using the
 * text-to-speech engine already built into Windows (SAPI, via
 * System.Speech.Synthesis), invoked through PowerShell and then
 * transcoded to MP3 with the FFmpeg binary the app already depends on.
 *
 * Chosen after two network-based free options failed in practice:
 * Pollinations' voice endpoint requires a funded balance (unlike its
 * image endpoint), and Microsoft Edge's online TTS service (via
 * @travisvn/edge-tts) hung indefinitely over a WebSocket connection in
 * both this project's own sandbox and the user's home network -- two
 * unrelated networks hitting the identical symptom pointed at the
 * approach itself, not either network. This provider makes no network
 * call at all, so none of those failure modes apply -- at the cost of a
 * more old-fashioned-sounding voice. Windows-only by design.
 */
export class WindowsSapiVoiceProvider implements VoiceGenerationProvider {
  async generateSpeech(input: GenerateSpeechInput): Promise<GeneratedAudio> {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "sapi-tts-"));
    const inputPath = path.join(workDir, "input.txt");
    const wavPath = path.join(workDir, "speech.wav");
    const mp3Path = path.join(workDir, `${randomUUID()}.mp3`);

    try {
      await fs.writeFile(inputPath, input.text, "utf-8");

      // Text is passed via a temp file (not inlined into the PowerShell
      // command string) so arbitrary narration content -- quotes,
      // newlines, whatever the AI wrote -- never has to be shell-escaped.
      // Only the two file paths need escaping, and those are always
      // server-generated temp paths, not user input.
      const escape = (p: string) => p.replace(/'/g, "''");
      const script = [
        "Add-Type -AssemblyName System.Speech",
        "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer",
        `$synth.SetOutputToWaveFile('${escape(wavPath)}')`,
        `$text = Get-Content -Raw -Encoding UTF8 '${escape(inputPath)}'`,
        "$synth.Speak($text)",
        "$synth.Dispose()",
      ].join("; ");

      await this.runPowerShell(script);
      await this.convertToMp3(wavPath, mp3Path);

      const data = await fs.readFile(mp3Path);
      return {
        data,
        mimeType: "audio/mpeg",
        provider: "windows-sapi",
        metadata: { characters: input.text.length },
      };
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private runPowerShell(script: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]);
      let stderr = "";
      proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));
      proc.on("error", (err) => reject(new ProviderError("windows-sapi", err.message, false)));
      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new ProviderError("windows-sapi", `PowerShell exited with code ${code}: ${stderr.slice(-1000)}`, false));
          return;
        }
        resolve();
      });
    });
  }

  private convertToMp3(wavPath: string, mp3Path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(env.FFMPEG_PATH, ["-y", "-i", wavPath, "-codec:a", "libmp3lame", mp3Path]);
      let stderr = "";
      proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));
      proc.on("error", (err) => reject(new ProviderError("windows-sapi", err.message, false)));
      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new ProviderError("windows-sapi", `ffmpeg exited with code ${code}: ${stderr.slice(-1000)}`, false));
          return;
        }
        resolve();
      });
    });
  }
}
