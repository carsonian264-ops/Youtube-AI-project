import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runFfmpeg } from "@/utils/ffmpegExec";
import { probeDurationSeconds } from "@/utils/mediaProbe";
import { buildZoompanFilter } from "./cameraMotion";
import { XFADE_CONFIG, type TransitionType } from "./transitionType";
import type { RenderAspectRatio, RenderProjectInput, RenderResult, VideoRenderer } from "./VideoRenderer";

const RESOLUTION: Record<RenderAspectRatio, { width: number; height: number }> = {
  LANDSCAPE_16_9: { width: 1920, height: 1080 },
  PORTRAIT_9_16: { width: 1080, height: 1920 },
  SQUARE_1_1: { width: 1080, height: 1080 },
};

// Every scene clip is rendered at the same explicit frame rate regardless
// of whether it uses camera motion. This matters beyond just camera
// motion (which needs it to animate at all -- see cameraMotion.ts):
// concatWithTransitions' xfade/acrossfade chain assumes every input clip
// shares a timebase, which a per-clip default frame rate can't guarantee.
const FPS = 30;
const OUTRO_FADE_SECONDS = 1.0;

/**
 * Real FFmpeg-based renderer. Every asset may have a different natural
 * duration (a scene's planned length vs. its actual narration length), so
 * each scene is rendered to its own clip first -- sized to the *longer*
 * of the two -- before all clips are concatenated. This avoids the naive
 * bug of assuming every scene/asset shares one duration.
 *
 * Pipeline:
 *   1. per scene: still image (looped, with Ken Burns motion unless the
 *      scene calls for a static shot) + narration audio -> clip.mp4,
 *      duration = max(scene.durationSeconds, narration duration)
 *   2. concat all scene clips with crossfade/dip transitions between them
 *      (xfade + acrossfade, not a hard-cut concat demuxer)
 *   3. mix background music under narration with sidechain ducking, or
 *      just loudness-normalize the narration alone if there's no music
 *   4. optional: burn in SRT captions
 */
export class FFmpegRenderer implements VideoRenderer {
  async render(input: RenderProjectInput): Promise<RenderResult> {
    const { width, height } = RESOLUTION[input.aspectRatio];
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "render-"));

    try {
      const clipPaths: string[] = [];
      for (const [index, scene] of input.scenes.entries()) {
        const clipPath = path.join(workDir, `scene-${index}.mp4`);
        await this.renderSceneClip(scene, width, height, clipPath);
        clipPaths.push(clipPath);
      }

      const transitionsOut = input.scenes.map((s) => s.transitionOut ?? "CROSSFADE");
      const concatPath = path.join(workDir, "concat.mp4");
      await this.concatWithTransitions(clipPaths, transitionsOut, concatPath);

      let currentPath = concatPath;

      const audioPath = path.join(workDir, "audio-final.mp4");
      if (input.musicPath) {
        await this.mixMusicWithDucking(currentPath, input.musicPath, audioPath);
      } else {
        await this.normalizeAudioOnly(currentPath, audioPath);
      }
      currentPath = audioPath;

      if (input.captionsSrtPath) {
        const withCaptionsPath = path.join(workDir, "with-captions.mp4");
        await this.burnCaptions(currentPath, input.captionsSrtPath, withCaptionsPath);
        currentPath = withCaptionsPath;
      }

      await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
      await fs.copyFile(currentPath, input.outputPath);

      const durationSeconds = await probeDurationSeconds(input.outputPath);
      return { outputPath: input.outputPath, durationSeconds, width, height };
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async renderSceneClip(
    scene: RenderProjectInput["scenes"][number],
    width: number,
    height: number,
    outputPath: string,
  ): Promise<void> {
    const audioDuration = scene.audioPath ? await probeDurationSeconds(scene.audioPath) : 0;
    const duration = Math.max(scene.durationSeconds, audioDuration, 1);
    const motion = scene.cameraMotion ?? "STATIC";
    const zoompanFilter = buildZoompanFilter(motion, width, height, FPS, duration);
    const videoFilter = zoompanFilter ?? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;

    const args = ["-y", "-loop", "1", "-framerate", String(FPS), "-t", String(duration), "-i", scene.visualPath];
    if (scene.audioPath) {
      args.push("-i", scene.audioPath);
    } else {
      args.push("-f", "lavfi", "-t", String(duration), "-i", "anullsrc=r=44100:cl=stereo");
    }

    const soundEffectPaths = scene.soundEffectPaths ?? [];
    for (const sfxPath of soundEffectPaths) {
      args.push("-i", sfxPath);
    }

    const encodeArgs = ["-c:v", "libx264", "-r", String(FPS), "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "44100", "-shortest", "-t", String(duration)];

    if (soundEffectPaths.length > 0) {
      // Each sound-effect input is much shorter than the scene -- apad
      // extends it with silence so amix's "duration=first" (matched to
      // narration/silence at [1:a]) isn't shortened to the effect's length.
      const sfxLabels = soundEffectPaths.map((_, i) => `[${i + 2}:a]apad[sfx${i}]`).join(";");
      const mixInputs = ["[1:a]", ...soundEffectPaths.map((_, i) => `[sfx${i}]`)].join("");
      const filterComplex =
        `[0:v]${videoFilter}[vout];` +
        `${sfxLabels};` +
        `${mixInputs}amix=inputs=${soundEffectPaths.length + 1}:duration=first[aout]`;
      args.push("-filter_complex", filterComplex, "-map", "[vout]", "-map", "[aout]", ...encodeArgs, outputPath);
    } else {
      args.push("-vf", videoFilter, ...encodeArgs, outputPath);
    }

    await runFfmpeg(args);
  }

  /**
   * Chains xfade (video) + acrossfade (audio) across every clip boundary
   * instead of the old hard-cut concat demuxer. xfade needs each
   * transition's start `offset` expressed as an absolute position in the
   * *merged-so-far* timeline, which shifts after every transition (each
   * one shortens the running total by its own duration) -- `cumulative`
   * tracks that running total. A single clip (no boundaries to cross)
   * skips all of this and is just copied through.
   *
   * The last scene's own transitionOut, if it's a fade-to-black/white
   * rather than a cut or crossfade (nothing to crossfade *into* on the
   * last scene), is treated as an outro: a fade at the very tail of the
   * finished video, video and audio together.
   */
  private async concatWithTransitions(clipPaths: string[], transitionsOut: TransitionType[], outputPath: string): Promise<void> {
    if (clipPaths.length === 1) {
      await fs.copyFile(clipPaths[0]!, outputPath);
      return;
    }

    const durations = await Promise.all(clipPaths.map((p) => probeDurationSeconds(p)));
    const inputArgs = clipPaths.flatMap((p) => ["-i", p]);

    let cumulative = durations[0]!;
    let videoLabel = "0:v";
    let audioLabel = "0:a";
    const filterParts: string[] = [];

    for (let i = 1; i < clipPaths.length; i++) {
      const { xfadeName, durationSeconds: xfadeDur } = XFADE_CONFIG[transitionsOut[i - 1]!];
      const offset = Math.max(0, cumulative - xfadeDur);
      const nextVideoLabel = `v${i}`;
      const nextAudioLabel = `a${i}`;
      filterParts.push(`[${videoLabel}][${i}:v]xfade=transition=${xfadeName}:duration=${xfadeDur}:offset=${offset.toFixed(3)}[${nextVideoLabel}]`);
      filterParts.push(`[${audioLabel}][${i}:a]acrossfade=d=${xfadeDur}[${nextAudioLabel}]`);
      videoLabel = nextVideoLabel;
      audioLabel = nextAudioLabel;
      cumulative = cumulative + durations[i]! - xfadeDur;
    }

    const lastTransition = transitionsOut[transitionsOut.length - 1]!;
    if (lastTransition === "FADE_BLACK" || lastTransition === "FADE_WHITE") {
      const color = lastTransition === "FADE_BLACK" ? "black" : "white";
      const fadeStart = Math.max(0, cumulative - OUTRO_FADE_SECONDS);
      filterParts.push(`[${videoLabel}]fade=t=out:st=${fadeStart.toFixed(3)}:d=${OUTRO_FADE_SECONDS}:color=${color}[${videoLabel}o]`);
      filterParts.push(`[${audioLabel}]afade=t=out:st=${fadeStart.toFixed(3)}:d=${OUTRO_FADE_SECONDS}[${audioLabel}o]`);
      videoLabel = `${videoLabel}o`;
      audioLabel = `${audioLabel}o`;
    }

    await runFfmpeg([
      "-y",
      ...inputArgs,
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      `[${videoLabel}]`,
      "-map",
      `[${audioLabel}]`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      outputPath,
    ]);
  }

  /**
   * VOICE -> DUCK MUSIC -> MIX -> FINAL LOUDNESS CONTROL. The music track
   * (already a short, precomputed loop -- see GeneratedMusicProvider) is
   * looped/trimmed to the full video's duration with its own fade in/out,
   * then sidechain-compressed against the narration so it audibly drops
   * while someone's talking and comes back up in the gaps, rather than
   * sitting at one flat reduced volume the whole time (which either
   * buries quiet narration or is too loud in the pauses). `amix` is told
   * not to auto-normalize (`normalize=0`) because that's what `loudnorm`
   * at the end is for -- letting both fight over levels produces an
   * inconsistent, sometimes-quiet result.
   */
  private async mixMusicWithDucking(videoPath: string, musicPath: string, outputPath: string): Promise<void> {
    const totalDuration = await probeDurationSeconds(videoPath);
    const fadeOutStart = Math.max(0, totalDuration - 2);
    const filterComplex =
      `[1:a]aloop=loop=-1:size=2e9,atrim=0:${totalDuration},volume=0.22,afade=t=in:d=1.5,afade=t=out:st=${fadeOutStart}:d=2[music];` +
      `[0:a]asplit=2[voice_main][voice_sc];` +
      `[music][voice_sc]sidechaincompress=threshold=0.05:ratio=8:attack=5:release=300:makeup=1[music_ducked];` +
      `[voice_main][music_ducked]amix=inputs=2:duration=first:normalize=0[premaster];` +
      `[premaster]loudnorm=I=-16:TP=-1.5:LRA=11[aout]`;

    await runFfmpeg([
      "-y",
      "-i",
      videoPath,
      "-i",
      musicPath,
      "-filter_complex",
      filterComplex,
      "-map",
      "0:v",
      "-map",
      "[aout]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-shortest",
      outputPath,
    ]);
  }

  /** No music: still loudness-normalized so every video has consistent, predictable output volume. */
  private async normalizeAudioOnly(videoPath: string, outputPath: string): Promise<void> {
    await runFfmpeg(["-y", "-i", videoPath, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:v", "copy", "-c:a", "aac", outputPath]);
  }

  private async burnCaptions(videoPath: string, srtPath: string, outputPath: string): Promise<void> {
    // FFmpeg's filtergraph parser treats a bare backslash inside a
    // single-quoted filter argument as an escape character for whatever
    // follows it -- so a raw Windows path like "C:\Users\...\file.srt"
    // gets every backslash silently swallowed by the time it reaches the
    // subtitles filter, leaving an unopenable, mangled path (this is a
    // well-known FFmpeg-on-Windows gotcha, not specific to this codebase).
    // Converting to forward slashes first sidesteps it entirely -- Windows
    // itself accepts forward slashes in paths just fine -- and the drive
    // letter's colon still needs its own escape since ':' is the filter
    // option separator.
    const escaped = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
    await runFfmpeg([
      "-y",
      "-i",
      videoPath,
      "-vf",
      `subtitles='${escaped}':force_style='FontSize=22,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=3'`,
      "-c:a",
      "copy",
      outputPath,
    ]);
  }
}
