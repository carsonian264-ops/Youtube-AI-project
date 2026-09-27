import type { Scene } from "@/generated/prisma";
import { CAPTION_STYLE_CONFIG, assColor, type CaptionStyleConfig, type CaptionStyleName } from "./captionStyles";

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

  /**
   * Builds an ASS (Advanced SubStation Alpha) caption file for one of the
   * named caption styles. Unlike buildSrt, this can express per-word
   * timing: "animated" styles (see captionStyles.ts) get a `{\kf}`
   * karaoke-fill sweep across each word, timed proportionally to word
   * length within the same per-block duration budget buildSrt already
   * computes -- reusing wrapNarrationIntoBlocks/allocateDurations so the
   * two formats stay in sync rather than drifting apart.
   */
  buildAss(scenes: SceneForCaptions[], styleName: CaptionStyleName, width: number, height: number): string {
    const style = CAPTION_STYLE_CONFIG[styleName];
    let cursor = 0;
    const events: string[] = [];

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
        const blockDuration = durations[i] ?? MIN_BLOCK_SECONDS;
        const end = cursor + blockDuration;
        cursor = end;

        const chunk = chunks[i] ?? "";
        const text = style.animated ? buildKaraokeText(chunk, blockDuration, style.uppercase) : buildStaticText(chunk, style.uppercase);
        if (!text) continue;

        events.push(`Dialogue: 0,${formatAssTimestamp(start)},${formatAssTimestamp(end)},Default,,0,0,0,,${text}`);
      }
    }

    return (
      buildAssHeader(style, width, height) +
      "[Events]\n" +
      "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n" +
      events.join("\n") +
      "\n"
    );
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

/** ASS timestamps are H:MM:SS.CC (centiseconds, single-digit hour). Rounds
 * through a total-centisecond integer first so 59.999s can't round up into
 * an invalid "60" seconds/minutes field. */
function formatAssTimestamp(totalSeconds: number): string {
  const totalCentis = Math.max(0, Math.round(totalSeconds * 100));
  const centis = totalCentis % 100;
  const totalSecondsInt = Math.floor(totalCentis / 100);
  const seconds = totalSecondsInt % 60;
  const totalMinutes = Math.floor(totalSecondsInt / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(centis)}`;
}

/** Plain (non-animated) caption block: line breaks become ASS's `\N`, optionally uppercased. */
function buildStaticText(block: string, uppercase: boolean): string {
  const text = uppercase ? block.toUpperCase() : block;
  return text.replace(/\n/g, "\\N");
}

/**
 * Animated caption block: every word gets its own `{\kf<centiseconds>}`
 * karaoke-fill tag, so the text sweeps from the style's secondaryColor to
 * primaryColor in sync with (an estimate of) when it's spoken. Per-word
 * duration is allocated proportional to word length, the same way
 * allocateDurations splits a scene's duration across blocks -- and, like
 * that function, the last word absorbs the rounding remainder so the sum
 * of every word's duration always equals the block's actual on-screen
 * time exactly (a running mismatch would otherwise drift the *next*
 * block's start out of sync after enough scenes).
 */
function buildKaraokeText(block: string, durationSeconds: number, uppercase: boolean): string {
  const lines = block.split("\n");
  const wordsPerLine = lines.map((line) => line.trim().split(/\s+/).filter(Boolean));
  const allWords = wordsPerLine.flat();
  if (allWords.length === 0) return "";

  const weights = allWords.map((w) => w.length);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;
  const totalCentis = Math.max(allWords.length, Math.round(durationSeconds * 100));
  const centisPerWord = weights.map((w) => Math.max(1, Math.round((w / totalWeight) * totalCentis)));
  const remainder = totalCentis - centisPerWord.reduce((sum, c) => sum + c, 0);
  centisPerWord[centisPerWord.length - 1] = Math.max(1, (centisPerWord[centisPerWord.length - 1] ?? 1) + remainder);

  let wordIndex = 0;
  const lineTexts = wordsPerLine.map((words) =>
    words
      .map((word) => {
        const centis = centisPerWord[wordIndex] ?? 1;
        wordIndex += 1;
        return `{\\kf${centis}}${uppercase ? word.toUpperCase() : word}`;
      })
      .join(" "),
  );
  return lineTexts.join("\\N");
}

function buildAssHeader(style: CaptionStyleConfig, width: number, height: number): string {
  const fontSize = Math.max(10, Math.round(height * style.fontSizeRatio));
  const marginV = Math.round(height * style.marginVRatio);
  const bold = style.bold ? -1 : 0;
  const italic = style.italic ? -1 : 0;
  const primary = assColor(style.primaryColor);
  const secondary = assColor(style.secondaryColor);
  const outline = assColor(style.outlineColor);
  const back = assColor(style.backColor, style.backAlpha);

  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${style.fontName},${fontSize},${primary},${secondary},${outline},${back},${bold},${italic},0,0,100,100,0,0,${style.borderStyle},${style.outlineWidth},${style.shadow},${style.alignment},20,20,${marginV},1`,
    "",
  ].join("\n");
}

export const captionService = new CaptionService();
