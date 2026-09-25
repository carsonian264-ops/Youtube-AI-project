import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { env } from "@/config/env";
import { ProviderError } from "@/utils/errors";
import { logger } from "@/utils/logger";
import { probeDurationSeconds } from "@/utils/mediaProbe";
import type { RenderAspectRatio, RenderProjectInput, RenderResult, VideoRenderer } from "./VideoRenderer";

const RESOLUTION: Record<RenderAspectRatio, { width: number; height: number }> = {
  LANDSCAPE_16_9: { width: 1920, height: 1080 },
  PORTRAIT_9_16: { width: 1080, height: 1920 },
  SQUARE_1_1: { width: 1080, height: 1080 },
};

/**
 * Real FFmpeg-based renderer. Every asset may have a different natural
 * duration (a scene's planned length vs. its actual narration length), so
 * each scene is rendered to its own clip first -- sized to the *longer*
 * of the two -- before all clips are concatenated. This avoids the naive
 * bug of assuming every scene/asset shares one duration.
 *
 * Pipeline:
 *   1. per scene: still image (looped) + narration audio -> clip.mp4,
 *      duration = max(scene.durationSeconds, narration duration)
 *   2. concat all scene clips (concat demuxer, matching codec/resolution)
 *   3. optional: mix background music under the concatenated narration
 *   4. optional: burn in SRT captions
 *   5. scale/pad to the target aspect ratio's resolution
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

      const concatPath = path.join(workDir, "concat.mp4");
      await this.concatClips(clipPaths, workDir, concatPath);

      let currentPath = concatPath;

      if (input.musicPath) {
        const withMusicPath = path.join(workDir, "with-music.mp4");
        await this.mixMusic(currentPath, input.musicPath, withMusicPath);
        currentPath = withMusicPath;
      }

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
    const scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;

    const args = ["-y", "-loop", "1", "-t", String(duration), "-i", scene.visualPath];
    if (scene.audioPath) {
      args.push("-i", scene.audioPath);
    } else {
      args.push("-f", "lavfi", "-t", String(duration), "-i", "anullsrc=r=44100:cl=stereo");
    }

    args.push(
      "-vf",
      scaleFilter,
      "-c:v",
      "libx264",
      "-tune",
      "stillimage",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-ar",
      "44100",
      "-shortest",
      "-t",
      String(duration),
      outputPath,
    );

    await this.run(args);
  }

  private async concatClips(clipPaths: string[], workDir: string, outputPath: string): Promise<void> {
    const listPath = path.join(workDir, "concat-list.txt");
    const listContent = clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
    await fs.writeFile(listPath, listContent, "utf-8");

    await this.run(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath]);
  }

  private async mixMusic(videoPath: string, musicPath: string, outputPath: string): Promise<void> {
    await this.run([
      "-y",
      "-i",
      videoPath,
      "-i",
      musicPath,
      "-filter_complex",
      "[1:a]volume=0.15,aloop=loop=-1:size=2e9[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]",
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
    await this.run([
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

  private run(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.debug({ args }, "Running ffmpeg");
      const proc = spawn(env.FFMPEG_PATH, args);
      let stderr = "";
      proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));
      proc.on("error", (err) => reject(new ProviderError("ffmpeg", err.message, false)));
      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new ProviderError("ffmpeg", `ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`, false));
          return;
        }
        resolve();
      });
    });
  }
}
