import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runFfmpeg } from "@/utils/ffmpegExec";
import type { GetSoundEffectInput, SoundEffectName, SoundEffectProvider } from "./SoundEffectProvider";

type ArgsBuilder = (outputPath: string) => string[];

const EFFECT_BUILDERS: Record<SoundEffectName, ArgsBuilder> = {
  // Two noise beds cross-fading from low-passed to high-passed, so the
  // perceived brightness rises over the clip -- a cheap way to fake a
  // sweeping pitch without a true time-varying filter.
  "whoosh-in": (outputPath) => [
    "-f",
    "lavfi",
    "-i",
    "anoisesrc=color=white:duration=0.5:sample_rate=44100",
    "-f",
    "lavfi",
    "-i",
    "anoisesrc=color=white:duration=0.5:sample_rate=44100",
    "-filter_complex",
    "[0:a]lowpass=f=900,afade=t=in:d=0.05,afade=t=out:st=0.15:d=0.35,volume=1.5[low];" +
      "[1:a]highpass=f=2500,afade=t=in:d=0.3,afade=t=out:st=0.4:d=0.1,volume=1.2[high];" +
      "[low][high]amix=inputs=2:duration=first[out]",
    "-map",
    "[out]",
    "-ar",
    "44100",
    "-ac",
    "2",
    outputPath,
  ],
  // Mirror of whoosh-in: brightness falls instead of rises.
  "whoosh-out": (outputPath) => [
    "-f",
    "lavfi",
    "-i",
    "anoisesrc=color=white:duration=0.5:sample_rate=44100",
    "-f",
    "lavfi",
    "-i",
    "anoisesrc=color=white:duration=0.5:sample_rate=44100",
    "-filter_complex",
    "[0:a]highpass=f=2500,afade=t=in:d=0.05,afade=t=out:st=0.15:d=0.35,volume=1.2[high];" +
      "[1:a]lowpass=f=900,afade=t=in:d=0.3,afade=t=out:st=0.4:d=0.1,volume=1.5[low];" +
      "[high][low]amix=inputs=2:duration=first[out]",
    "-map",
    "[out]",
    "-ar",
    "44100",
    "-ac",
    "2",
    outputPath,
  ],
  ding: (outputPath) => [
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=1200:duration=0.45",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=1800:duration=0.45",
    "-filter_complex",
    "[0:a][1:a]amix=inputs=2:duration=first:weights=1 0.5[mixed];" +
      "[mixed]afade=t=in:d=0.01,afade=t=out:st=0.08:d=0.37,volume=3.0[out]",
    "-map",
    "[out]",
    "-ar",
    "44100",
    "-ac",
    "2",
    outputPath,
  ],
  pop: (outputPath) => [
    "-f",
    "lavfi",
    "-i",
    "anoisesrc=color=white:duration=0.08:sample_rate=44100",
    "-filter_complex",
    "[0:a]lowpass=f=5000,afade=t=in:d=0.003,afade=t=out:st=0.01:d=0.06,volume=1.5[out]",
    "-map",
    "[out]",
    "-ar",
    "44100",
    "-ac",
    "2",
    outputPath,
  ],
  // A linear frequency sweep (150Hz -> 900Hz) synthesized directly as a
  // phase expression, paired with a rising volume -- the classic
  // building-tension "riser" used before a reveal.
  riser: (outputPath) => [
    "-f",
    "lavfi",
    "-i",
    "aevalsrc='sin(2*PI*(150*t + (900-150)/(2*1.2)*t*t))':d=1.2:s=44100",
    "-filter_complex",
    "[0:a]afade=t=in:d=1.2,volume=0.7[out]",
    "-map",
    "[out]",
    "-ar",
    "44100",
    "-ac",
    "2",
    outputPath,
  ],
  thud: (outputPath) => [
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=60:duration=0.3",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=90:duration=0.3",
    "-f",
    "lavfi",
    "-i",
    "anoisesrc=color=white:duration=0.02:sample_rate=44100",
    "-filter_complex",
    "[0:a][1:a]amix=inputs=2:duration=first:weights=1 0.6[bass];" +
      "[2:a]lowpass=f=2000[click];" +
      "[bass][click]amix=inputs=2:duration=first[mixed];" +
      "[mixed]afade=t=in:d=0.005,afade=t=out:st=0.05:d=0.25,volume=3.0[out]",
    "-map",
    "[out]",
    "-ar",
    "44100",
    "-ac",
    "2",
    outputPath,
  ],
};

/**
 * Synthesizes short sound-effect accents (whooshes, a ding, a pop, a
 * riser, a thud) entirely with ffmpeg's own noise/tone generators and
 * filters -- no external API, no per-render cost, no licensing risk.
 * Mirrors GeneratedMusicProvider's approach for background music.
 */
export class GeneratedSoundEffectProvider implements SoundEffectProvider {
  async getEffect(input: GetSoundEffectInput): Promise<string> {
    const buildArgs = EFFECT_BUILDERS[input.name];
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "sfx-"));
    const outputPath = path.join(workDir, `${randomUUID()}.wav`);
    await runFfmpeg(["-y", ...buildArgs(outputPath)]);
    return outputPath;
  }
}
