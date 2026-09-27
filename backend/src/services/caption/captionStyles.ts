/**
 * Named caption looks, rendered as ASS (Advanced SubStation Alpha)
 * subtitles so word-level timing/highlighting is possible -- something the
 * plain SRT format CaptionService previously produced has no way to
 * express. Each style is a data object, not a branch of scattered
 * if/else in the renderer, per the project's "centralize config instead
 * of conditionals" convention (see videoStyle.ts, which picks one of
 * these per project style).
 *
 * `animated` styles get word-level `{\kf}` karaoke-fill timing (the text
 * sweeps from secondaryColor to primaryColor in sync with narration, the
 * "TikTok captions" look); static styles render each caption block as one
 * plain line, colored with primaryColor throughout.
 */
export type CaptionStyleName = "CLASSIC" | "CREATOR" | "CINEMATIC" | "BOLD" | "MINIMAL" | "HIGHLIGHT";

export interface CaptionStyleConfig {
  fontName: string;
  /** Font size as a fraction of the video's height, so it scales across aspect ratios/resolutions. */
  fontSizeRatio: number;
  bold: boolean;
  italic: boolean;
  uppercase: boolean;
  /** RRGGBB. For animated styles this is the "already spoken" karaoke fill color. */
  primaryColor: string;
  /** RRGGBB. Only meaningful for animated styles: the "not yet spoken" color. */
  secondaryColor: string;
  outlineColor: string;
  backColor: string;
  /** 0 (opaque) - 255 (fully transparent), applied to backColor only. */
  backAlpha: number;
  /** ASS BorderStyle: 1 = outline + drop shadow, 3 = opaque box behind text. */
  borderStyle: 1 | 3;
  outlineWidth: number;
  shadow: number;
  /** ASS numpad alignment (2 = bottom-center, 5 = middle-center). */
  alignment: number;
  /** Vertical margin as a fraction of video height. */
  marginVRatio: number;
  animated: boolean;
}

export const CAPTION_STYLE_CONFIG: Record<CaptionStyleName, CaptionStyleConfig> = {
  CLASSIC: {
    fontName: "DejaVu Sans",
    fontSizeRatio: 0.035,
    bold: false,
    italic: false,
    uppercase: false,
    primaryColor: "FFFFFF",
    secondaryColor: "FFFFFF",
    outlineColor: "000000",
    backColor: "000000",
    backAlpha: 0,
    borderStyle: 1,
    outlineWidth: 2,
    shadow: 1,
    alignment: 2,
    marginVRatio: 0.06,
    animated: false,
  },
  CREATOR: {
    fontName: "DejaVu Sans",
    fontSizeRatio: 0.05,
    bold: true,
    italic: false,
    uppercase: false,
    primaryColor: "FFD400",
    secondaryColor: "FFFFFF",
    outlineColor: "000000",
    backColor: "000000",
    backAlpha: 0,
    borderStyle: 1,
    outlineWidth: 3,
    shadow: 2,
    alignment: 2,
    marginVRatio: 0.08,
    animated: true,
  },
  CINEMATIC: {
    fontName: "DejaVu Sans",
    fontSizeRatio: 0.032,
    bold: false,
    italic: true,
    uppercase: false,
    primaryColor: "FFFFFF",
    secondaryColor: "FFFFFF",
    outlineColor: "000000",
    backColor: "000000",
    backAlpha: 0,
    borderStyle: 1,
    outlineWidth: 1,
    shadow: 1,
    alignment: 2,
    marginVRatio: 0.1,
    animated: false,
  },
  BOLD: {
    fontName: "DejaVu Sans",
    fontSizeRatio: 0.062,
    bold: true,
    italic: false,
    uppercase: true,
    primaryColor: "FFEE00",
    secondaryColor: "FFFFFF",
    outlineColor: "000000",
    backColor: "000000",
    backAlpha: 0,
    borderStyle: 1,
    outlineWidth: 4,
    shadow: 0,
    alignment: 5,
    marginVRatio: 0,
    animated: true,
  },
  MINIMAL: {
    fontName: "DejaVu Sans",
    fontSizeRatio: 0.03,
    bold: false,
    italic: false,
    uppercase: false,
    primaryColor: "FFFFFF",
    secondaryColor: "FFFFFF",
    outlineColor: "000000",
    backColor: "000000",
    backAlpha: 96,
    borderStyle: 3,
    outlineWidth: 0,
    shadow: 0,
    alignment: 2,
    marginVRatio: 0.05,
    animated: false,
  },
  HIGHLIGHT: {
    fontName: "DejaVu Sans",
    fontSizeRatio: 0.045,
    bold: true,
    italic: false,
    uppercase: false,
    primaryColor: "39FF88",
    secondaryColor: "FFFFFF",
    outlineColor: "000000",
    backColor: "000000",
    backAlpha: 0,
    borderStyle: 1,
    outlineWidth: 3,
    shadow: 1,
    alignment: 2,
    marginVRatio: 0.08,
    animated: true,
  },
};

/**
 * Converts an RRGGBB hex string to ASS's native &HAABBGGRR color format
 * (alpha, then blue/green/red -- the reverse byte order of normal hex,
 * and 0x00 alpha means fully opaque, not transparent).
 */
export function assColor(hexRgb: string, alpha = 0): string {
  const hex = hexRgb.replace(/^#/, "");
  const r = hex.slice(0, 2);
  const g = hex.slice(2, 4);
  const b = hex.slice(4, 6);
  const aa = Math.max(0, Math.min(255, alpha)).toString(16).padStart(2, "0").toUpperCase();
  return `&H${aa}${b.toUpperCase()}${g.toUpperCase()}${r.toUpperCase()}`;
}
