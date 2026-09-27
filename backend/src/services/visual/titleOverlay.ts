import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runFfmpeg } from "@/utils/ffmpegExec";
import { logger } from "@/utils/logger";

// backend/assets/fonts sits next to src/ and dist/, so this resolves the
// same way whether running the compiled build (dist/services/visual/) or
// tsx against source directly (src/services/visual/) -- both are exactly
// two directories below backend/.
const FONT_PATH = path.join(__dirname, "..", "..", "..", "assets", "fonts", "DejaVuSans-Bold.ttf");

/**
 * ffmpeg's filtergraph parser treats ':' as a key=value separator and
 * backslash as its own escape character, so a Windows path (C:\...) used
 * as a filter option's value needs its drive-letter colon escaped and its
 * backslashes normalized to forward slashes (which ffmpeg accepts fine on
 * Windows and which sidesteps a separate backslash-escaping problem).
 */
function escapeFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:");
}

/**
 * Composites the project title onto a generated thumbnail as bold,
 * outlined text. Two things this deliberately avoids:
 *  - Asking the image model itself to draw the title (an earlier version
 *    of the thumbnail prompt did): diffusion models tend to degrade the
 *    whole image into a flat title card instead of a photo with lettering
 *    on it once "render this text" dominates the prompt.
 *  - Passing the title through drawtext's `text=` option directly:
 *    ffmpeg's single-quote escaping for a literal apostrophe inside a
 *    single-quoted filter value doesn't behave like shell quoting (tested
 *    against a real ffmpeg build -- it silently mangles the text and can
 *    swallow the rest of the filter chain). `textfile=` sidesteps this: the
 *    title's raw bytes go straight to a file with none of that escaping,
 *    at the cost of one character it still can't take literally -- '%'
 *    triggers drawtext's own text-expansion syntax regardless of escaping,
 *    so it's stripped rather than rendered incorrectly.
 *
 * Best-effort: some ffmpeg builds (particularly minimal Windows builds)
 * don't have drawtext's font backend compiled in. On any failure this
 * returns the original image unmodified (with its original mimeType --
 * the output is always PNG on success, which callers need to know since
 * they're about to set the upload's Content-Type from this result) rather
 * than failing the whole thumbnail job over a missing filter.
 */
export async function addTitleOverlay(
  imageData: Buffer,
  mimeType: string,
  title: string,
): Promise<{ data: Buffer; mimeType: string }> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "thumb-overlay-"));
  try {
    const inputPath = path.join(workDir, "input.png");
    const outputPath = path.join(workDir, "output.png");
    const titlePath = path.join(workDir, "title.txt");
    const cleanTitle = title.replace(/%/g, "").trim() || "Untitled";
    await fs.writeFile(inputPath, imageData);
    await fs.writeFile(titlePath, cleanTitle, "utf-8");

    // fontsize shrinks for longer titles so they stay inside the frame
    // instead of overflowing -- text_w isn't known until fontsize is
    // picked, so this estimates from character count instead of measuring
    // the actual rendered width.
    const approxCharWidth = 0.62;
    const charCount = Math.max(cleanTitle.length, 1);
    const fontsizeExpr = `min(h*0.20\\,w*0.9/(${charCount}*${approxCharWidth}))`;
    // A dark scrim across the bottom band gives the title a clean, high-
    // contrast stage no matter what the AI drew there -- including its own
    // stray text, which "no text in the image" prompting doesn't always
    // suppress (diffusion models trained on real thumbnails have a strong
    // prior toward drawing lettering). Without this, the title text and
    // the model's own attempt at title text can end up visibly stacked on
    // top of each other.
    const scrim = "drawbox=x=0:y=ih*0.72:w=iw:h=ih*0.28:color=black@0.5:t=fill";
    const drawtext = [
      `drawtext=fontfile='${escapeFilterPath(FONT_PATH)}'`,
      `textfile='${escapeFilterPath(titlePath)}'`,
      "fontcolor=yellow",
      `fontsize=${fontsizeExpr}`,
      "bordercolor=black",
      "borderw=10",
      "x=(w-text_w)/2",
      "y=h-(text_h*2.0)",
    ].join(":");
    const filter = `${scrim},${drawtext}`;

    await runFfmpeg(["-y", "-i", inputPath, "-vf", filter, "-update", "1", "-frames:v", "1", outputPath]);
    const data = await fs.readFile(outputPath);
    return { data, mimeType: "image/png" };
  } catch (err) {
    logger.warn({ err, title }, "Thumbnail title overlay failed; using the plain generated image instead");
    return { data: imageData, mimeType };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
