export type TransitionType = "CROSSFADE" | "FADE_BLACK" | "FADE_WHITE" | "HARD_CUT";

/**
 * Maps each TransitionType to its ffmpeg `xfade` filter name and a
 * duration. HARD_CUT still goes through xfade (rather than a separate
 * code path) with a near-zero duration -- imperceptible from a real cut,
 * but it keeps concatWithTransitions to one filter-graph-building
 * function instead of branching between "xfade chain" and "plain concat"
 * depending on whether any scene actually wants a transition.
 */
export const XFADE_CONFIG: Record<TransitionType, { xfadeName: string; durationSeconds: number }> = {
  CROSSFADE: { xfadeName: "fade", durationSeconds: 0.5 },
  FADE_BLACK: { xfadeName: "fadeblack", durationSeconds: 0.6 },
  FADE_WHITE: { xfadeName: "fadewhite", durationSeconds: 0.6 },
  // Verified against a real ffmpeg build: a near-zero duration (tried
  // 0.001s first) breaks xfade's internal frame accounting and silently
  // truncates the whole rest of the chained output by several seconds --
  // not just this one transition. 0.05s (1-2 frames at 30fps) is still
  // imperceptible as an actual transition but stays well clear of that bug.
  HARD_CUT: { xfadeName: "fade", durationSeconds: 0.05 },
};

/**
 * Scene.transition is free-form text the AI content provider writes (see
 * schemas.ts -- it defaults to "cut" when omitted). Semantically it
 * describes the transition *out of* this scene, into the next one (or, on
 * the last scene, out of the video entirely -- MockAIContentProvider
 * already writes "fade-to-black" there, which reads naturally as an
 * outro fade rather than a scene-to-scene cut).
 *
 * Default is CROSSFADE, not HARD_CUT: the spec calling for "subtle
 * cinematic transitions" as the default only holds if unrecognized/absent
 * text doesn't silently fall back to the same hard cuts this feature
 * exists to move away from. An explicit "cut" is still honored literally
 * -- this only affects the unrecognized/empty case.
 */
export function parseTransition(transition: string | null | undefined): TransitionType {
  const text = (transition ?? "").toLowerCase();

  if (/\bcut\b/.test(text)) return "HARD_CUT";
  if (/black\b/.test(text)) return "FADE_BLACK";
  if (/white\b/.test(text)) return "FADE_WHITE";
  if (/fade|crossfade|dissolve/.test(text)) return "CROSSFADE";

  return "CROSSFADE";
}
