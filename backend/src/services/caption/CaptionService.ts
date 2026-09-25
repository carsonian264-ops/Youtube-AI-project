import type { Scene } from "@/generated/prisma";

const MAX_LINE_CHARS = 42;
const MAX_LINES_PER_BLOCK = 2;
const MIN_BLOCK_SECONDS = 1.2;

export type SceneForCaptions = Pick<Scene, "sceneNumber" | "narration" | "durationSeconds">;

/**
 * Builds an SRT caption file from scenes' narration text.
 *
 * Each scene's narration is wrapped into short, readable blocks (industry
 * standard: max 2 lines, ~42 chars/line) instead of one giant paragraph
 * shown for the whole scene. Each block's on-screen time is a share of
 * the scene's duration proportional to its character count, which by the
 * time captions run already reflects the real generated narration audio
 * length -- not just the planned script estimate -- since
 * voiceGeneration.worker.ts stretches scene.durationSeconds up to match
 * the actual audio, and FFmpegRenderer renders each scene's clip to that
 * same duration. So captions stay in sync with the real rendered video.
 */
export class CaptionService {
  buildSrt(scenes: SceneForCaptions[]): string {
    let cursor = 0;
    let index = 0;
    const blocks: string[] = [];

    for (const scene of scenes.slice().sort((a, b) => a.sceneNumber - b.sceneNumber)) {
      const sceneDuration = Math.max(scene.durationSeconds, 1);
      const chunks = wrapNarrationIntoBlocks(scene.narration);

      if (chunks.length === 0) {
        cursor += sceneDuration;
        continue;
      }

      const durations = allocateDurations(chunks, sceneDuration);
      for (let i = 0; i < chunks.length; i++) {
        const start = cursor;
        const end = cursor + (durations[i] ?? MIN_BLOCK_SECONDS);
        cursor = end;
        index += 1;
        blocks.push([String(index), `${formatTimestamp(start)} --> ${formatTimestamp(end)}`, chunks[i] ?? "", ""].join("\n"));
      }
    }

    return blocks.join("\n");
  }
}

/** Wraps narration into short lines, then groups those lines into
 * on-screen blocks of at most MAX_LINES_PER_BLOCK lines each. */
function wrapNarrationIntoBlocks(narration: string): string[] {
  const words = narration.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > MAX_LINE_CHARS && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  const blocks: string[] = [];
  for (let i = 0; i < lines.length; i += MAX_LINES_PER_BLOCK) {
    blocks.push(lines.slice(i, i + MAX_LINES_PER_BLOCK).join("\n"));
  }
  return blocks;
}

/** Splits a scene's duration across its caption blocks proportional to
 * each block's character count (a proxy for how long it takes to say),
 * while enforcing a minimum on-screen time so short blocks aren't an
 * unreadable flicker. Always sums to exactly the budget it's given, so
 * the caller's timing cursor never drifts out of sync with the scene. */
function allocateDurations(blocks: string[], sceneDurationSeconds: number): number[] {
  const weights = blocks.map((block) => block.replace(/\n/g, " ").length);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;
  const budget = Math.max(sceneDurationSeconds, blocks.length * MIN_BLOCK_SECONDS);

  const raw = weights.map((w) => Math.max((w / totalWeight) * budget, MIN_BLOCK_SECONDS));
  const scale = budget / raw.reduce((sum, d) => sum + d, 0);
  return raw.map((d) => d * scale);
}

function formatTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const millis = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

export const captionService = new CaptionService();
