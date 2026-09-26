import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/config/env";
import { probeDurationSeconds } from "@/utils/mediaProbe";
import { GeneratedMusicProvider } from "./GeneratedMusicProvider";
import type { PlayableMusicMood } from "./MusicProvider";

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

describe("GeneratedMusicProvider", () => {
  const provider = new GeneratedMusicProvider();
  const generatedDirs: string[] = [];

  afterAll(async () => {
    await Promise.all(generatedDirs.map((dir) => fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)));
  });

  it.each<PlayableMusicMood>(["UPBEAT", "CALM", "CINEMATIC", "DRAMATIC"])(
    "generates a real, non-silent %s track",
    async (mood) => {
      const trackPath = await provider.getTrack(mood);
      generatedDirs.push(path.dirname(trackPath));

      const duration = await probeDurationSeconds(trackPath);
      expect(duration).toBeGreaterThan(10);

      const peakDb = await measurePeakVolumeDb(trackPath);
      // Anything quieter than -50dB is effectively silence; a real
      // synthesized chord should peak well above that.
      expect(peakDb).toBeGreaterThan(-50);
      // And it must not be clipping/distorted from the volume boost.
      expect(peakDb).toBeLessThanOrEqual(0);
    },
  );

  it("gives each mood a distinct track (not a shared/cached fixture)", async () => {
    const first = await provider.getTrack("CALM");
    const second = await provider.getTrack("CALM");
    generatedDirs.push(path.dirname(first), path.dirname(second));

    expect(first).not.toBe(second);
    await expect(fs.access(first)).resolves.toBeUndefined();
    await expect(fs.access(second)).resolves.toBeUndefined();
  });
});
