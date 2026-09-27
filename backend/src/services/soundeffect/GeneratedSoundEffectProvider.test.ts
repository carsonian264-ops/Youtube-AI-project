import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/config/env";
import { probeDurationSeconds } from "@/utils/mediaProbe";
import { GeneratedSoundEffectProvider } from "./GeneratedSoundEffectProvider";
import { SOUND_EFFECT_NAMES } from "./SoundEffectProvider";

function measurePeakVolumeDb(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.FFMPEG_PATH, ["-i", filePath, "-af", "volumedetect", "-f", "null", "-"]);
    let stderr = "";
    proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
        return;
      }
      const match = stderr.match(/max_volume:\s*(-?\d+(\.\d+)?)\s*dB/);
      resolve(match ? parseFloat(match[1]!) : -Infinity);
    });
  });
}

describe("GeneratedSoundEffectProvider", () => {
  const provider = new GeneratedSoundEffectProvider();
  const generatedDirs: string[] = [];

  afterAll(async () => {
    await Promise.all(generatedDirs.map((dir) => fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)));
  });

  it.each(SOUND_EFFECT_NAMES)("generates a real, non-silent, non-clipping '%s' effect", async (name) => {
    const effectPath = await provider.getEffect({ name });
    generatedDirs.push(path.dirname(effectPath));

    const duration = await probeDurationSeconds(effectPath);
    expect(duration).toBeGreaterThan(0.03);
    expect(duration).toBeLessThan(2);

    const peakDb = await measurePeakVolumeDb(effectPath);
    expect(peakDb).toBeGreaterThan(-50);
    // Headroom check: this is exactly the class of bug found in the
    // background-music/narration mix (real renders peaking at or above
    // 0dBFS) -- these clips get layered under narration afterward, so
    // each one needs its own margin below full scale too.
    expect(peakDb).toBeLessThan(-1);
  });
});
