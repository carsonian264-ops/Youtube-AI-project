export type CameraMotionType = "ZOOM_IN" | "ZOOM_OUT" | "PAN_LEFT" | "PAN_RIGHT" | "PAN_UP" | "PAN_DOWN" | "DIAGONAL" | "STATIC";

const ROTATION: CameraMotionType[] = ["ZOOM_IN", "PAN_RIGHT", "ZOOM_OUT", "PAN_LEFT", "DIAGONAL", "PAN_UP", "PAN_DOWN"];

/**
 * Scene.cameraDirection is free-form text the AI content provider writes
 * (e.g. "slow push-in", "static wide", "pan across the skyline") -- never a
 * constrained enum, since forcing the model to a fixed vocabulary tends to
 * produce worse creative direction than just describing the shot and
 * parsing it after the fact. Keyword matching here is deliberately
 * generous (checked in a specific order so more distinctive words like
 * "push"/"pull" win over the generic "zoom").
 *
 * Fallback: cycling deterministically by scene index rather than a fixed
 * default is what actually matters here -- MockAIContentProvider (the
 * zero-cost default provider) previously wrote "static wide" for every
 * non-hook/CTA scene, which would make this whole system invisible for
 * the common case of a totally static direction. An unrecognized or empty
 * direction gets a varied motion instead of silently doing nothing.
 *
 * `rotation` lets a project's video style (see videoStyle.ts) bias which
 * motions that fallback cycles through -- e.g. NEWS leans STATIC-heavy,
 * SHORT_FORM leans ZOOM_IN-heavy -- without touching the keyword parsing
 * above, which still wins whenever the AI's own direction is recognizable.
 */
export function parseCameraMotion(direction: string | null | undefined, sceneIndex: number, rotation: CameraMotionType[] = ROTATION): CameraMotionType {
  const text = (direction ?? "").toLowerCase();

  if (/\bstatic\b|\bfixed\b|\bstill\b|\bno movement\b|\bwide shot\b/.test(text) && !/\bpush\b|\bpull\b|\bzoom\b|\bpan\b/.test(text)) {
    return "STATIC";
  }
  if (/\bpush.?in\b|\bzoom.?in\b|\bmove(s)? closer\b/.test(text)) return "ZOOM_IN";
  if (/\bpull.?(back|out)\b|\bzoom.?out\b|\bmove(s)? (away|back)\b/.test(text)) return "ZOOM_OUT";
  if (/\bpan(s)?\s+(to the )?left\b|\bleft to right\b.*\breverse\b/.test(text)) return "PAN_LEFT";
  if (/\bpan(s)?\s+(to the )?right\b/.test(text)) return "PAN_RIGHT";
  if (/\btilt(s)?\s+up\b|\bpan(s)?\s+up\b/.test(text)) return "PAN_UP";
  if (/\btilt(s)?\s+down\b|\bpan(s)?\s+down\b/.test(text)) return "PAN_DOWN";
  if (/\bdiagonal\b/.test(text)) return "DIAGONAL";
  if (/\bzoom\b/.test(text)) return "ZOOM_IN";
  if (/\bpan\b/.test(text)) return "PAN_RIGHT";

  const cycle = rotation.length > 0 ? rotation : ROTATION;
  return cycle[((sceneIndex % cycle.length) + cycle.length) % cycle.length] ?? "STATIC";
}

/**
 * Builds the zoompan (Ken Burns) filter chain for one scene, or null for
 * STATIC (the caller falls back to a plain scale/crop, unchanged from
 * before this feature existed).
 *
 * Two things this depends on that took real trial and error against a
 * real ffmpeg build to get right (not just reading the docs):
 *  - The `-framerate` flag MUST be set on the looped image input
 *    (`-loop 1 -framerate F -i image.png`), not just inside the zoompan
 *    filter's own `fps=` option. Without it, zoompan's self-referencing
 *    `zoom`/`x`/`y` expressions never advance past frame 0 -- verified by
 *    diffing frame hashes across a rendered clip, not by inspection.
 *  - The source must be pre-scaled well above the target resolution
 *    before zoompan runs, so the panned/zoomed crop window still has
 *    enough source pixels to scale back up without visible softness.
 *
 * All motion is intentionally subtle (<=15% zoom / pan range over the
 * whole scene) and duration-aware (the increment is computed from the
 * actual frame count so a 3s scene and a 12s scene both complete their
 * motion smoothly instead of one finishing early or barely moving).
 */
export function buildZoompanFilter(motion: CameraMotionType, width: number, height: number, fps: number, durationSeconds: number): string | null {
  if (motion === "STATIC") return null;

  const totalFrames = Math.max(2, Math.round(durationSeconds * fps));
  const upscale = `scale=${width * 2}:${height * 2}`;
  const zoomRange = 0.15;
  const panZoom = 1.12; // constant zoom held during a pure pan, so there's room to move without hitting the source edge

  let z: string;
  let x: string;
  let y: string;

  switch (motion) {
    case "ZOOM_IN":
      z = `min(zoom+${zoomRange}/${totalFrames},${1 + zoomRange})`;
      x = "iw/2-(iw/zoom/2)";
      y = "ih/2-(ih/zoom/2)";
      break;
    case "ZOOM_OUT":
      z = `if(eq(on,0),${1 + zoomRange},max(zoom-${zoomRange}/${totalFrames},1))`;
      x = "iw/2-(iw/zoom/2)";
      y = "ih/2-(ih/zoom/2)";
      break;
    case "PAN_LEFT":
      z = `${panZoom}`;
      x = `(iw-iw/zoom)*(1-on/(${totalFrames}-1))`;
      y = "ih/2-(ih/zoom/2)";
      break;
    case "PAN_RIGHT":
      z = `${panZoom}`;
      x = `(iw-iw/zoom)*(on/(${totalFrames}-1))`;
      y = "ih/2-(ih/zoom/2)";
      break;
    case "PAN_UP":
      z = `${panZoom}`;
      x = "iw/2-(iw/zoom/2)";
      y = `(ih-ih/zoom)*(1-on/(${totalFrames}-1))`;
      break;
    case "PAN_DOWN":
      z = `${panZoom}`;
      x = "iw/2-(iw/zoom/2)";
      y = `(ih-ih/zoom)*(on/(${totalFrames}-1))`;
      break;
    case "DIAGONAL":
      z = `${panZoom}`;
      x = `(iw-iw/zoom)*(on/(${totalFrames}-1))`;
      y = `(ih-ih/zoom)*(on/(${totalFrames}-1))`;
      break;
  }

  return `${upscale},zoompan=z='${z}':d=1:x='${x}':y='${y}':s=${width}x${height}:fps=${fps}`;
}
