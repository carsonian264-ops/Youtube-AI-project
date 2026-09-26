import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runFfmpeg } from "@/utils/ffmpegExec";
import type { MusicProvider, PlayableMusicMood } from "./MusicProvider";

interface MoodConfig {
  /** Chord tones (Hz) layered together to form the ambient pad. */
  frequencies: number[];
  weights: number[];
  tremoloFrequency: number;
  tremoloDepth: number;
  echoDelayMs: number;
  echoDecay: number;
  volume: number;
  durationSeconds: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
}

const MOOD_CONFIGS: Record<PlayableMusicMood, MoodConfig> = {
  CALM: {
    frequencies: [261.63, 329.63, 392.0], // C4 major triad
    weights: [1, 0.8, 0.6],
    tremoloFrequency: 2.5,
    tremoloDepth: 0.4,
    echoDelayMs: 60,
    echoDecay: 0.7,
    volume: 3.5,
    durationSeconds: 24,
    fadeInSeconds: 2,
    fadeOutSeconds: 3,
  },
  UPBEAT: {
    frequencies: [261.63, 523.25, 659.25], // bass root under a bright major triad
    weights: [0.9, 0.7, 0.6],
    tremoloFrequency: 6,
    tremoloDepth: 0.5,
    echoDelayMs: 40,
    echoDecay: 0.5,
    volume: 4.0,
    durationSeconds: 16,
    fadeInSeconds: 1,
    fadeOutSeconds: 1.5,
  },
  CINEMATIC: {
    frequencies: [130.81, 196.0, 523.25], // low drone + fifth + high shimmer
    weights: [1.0, 0.7, 0.3],
    tremoloFrequency: 1.2,
    tremoloDepth: 0.3,
    echoDelayMs: 150,
    echoDecay: 0.85,
    volume: 5.0,
    durationSeconds: 30,
    fadeInSeconds: 4,
    fadeOutSeconds: 5,
  },
  DRAMATIC: {
    frequencies: [220.0, 261.63, 329.63], // A minor triad
    weights: [1.0, 0.8, 0.7],
    tremoloFrequency: 1.8,
    tremoloDepth: 0.5,
    echoDelayMs: 90,
    echoDecay: 0.75,
    volume: 4.0,
    durationSeconds: 24,
    fadeInSeconds: 3,
    fadeOutSeconds: 3,
  },
};

/**
 * Synthesizes a short, loopable ambient music bed entirely with ffmpeg's
 * built-in signal generators and filters -- sine tones mixed into a chord,
 * shaped with tremolo/echo/fades. FFmpegRenderer already loops whatever
 * track it's given and mixes it under the narration at reduced volume
 * (see mixMusic), so this only needs to hand back one clean loop per mood.
 */
export class GeneratedMusicProvider implements MusicProvider {
  async getTrack(mood: PlayableMusicMood): Promise<string> {
    const config = MOOD_CONFIGS[mood];
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "music-"));
    const outputPath = path.join(workDir, `${randomUUID()}.wav`);

    const inputArgs = config.frequencies.flatMap((frequency) => [
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${frequency}:duration=${config.durationSeconds}`,
    ]);
    const mixInputs = config.frequencies.map((_, i) => `[${i}:a]`).join("");
    const fadeOutStart = config.durationSeconds - config.fadeOutSeconds;
    const filterComplex =
      `${mixInputs}amix=inputs=${config.frequencies.length}:duration=longest:weights=${config.weights.join(" ")}[mixed];` +
      `[mixed]tremolo=f=${config.tremoloFrequency}:d=${config.tremoloDepth},` +
      `aecho=0.8:${config.echoDecay}:${config.echoDelayMs}:0.35,` +
      `afade=t=in:d=${config.fadeInSeconds},` +
      `afade=t=out:st=${fadeOutStart}:d=${config.fadeOutSeconds},` +
      `volume=${config.volume}[out]`;

    await runFfmpeg(["-y", ...inputArgs, "-filter_complex", filterComplex, "-map", "[out]", "-ar", "44100", "-ac", "2", outputPath]);

    return outputPath;
  }
}
