export const SOUND_EFFECT_NAMES = ["whoosh-in", "whoosh-out", "ding", "pop", "riser", "thud"] as const;
export type SoundEffectName = (typeof SOUND_EFFECT_NAMES)[number];

export function isSoundEffectName(value: string): value is SoundEffectName {
  return (SOUND_EFFECT_NAMES as readonly string[]).includes(value);
}

/**
 * Shared with the AI prompts (GeminiProvider/ClaudeProvider) so the exact
 * vocabulary the model is told to use always matches what this app can
 * actually render. The Scene.soundEffects column stays a loose string
 * array rather than a hard enum -- an AI-invented name outside this list
 * is silently skipped at render time (see videoRendering.worker.ts)
 * rather than failing the whole scene over a cosmetic accent.
 */
export const SOUND_EFFECT_PROMPT_HINT =
  'soundEffects: string[] -- zero or more of exactly "whoosh-in", "whoosh-out", "ding", "pop", "riser", "thud". ' +
  'Use "whoosh-in" for an opening hook, "riser" right before a reveal or call-to-action, "ding" for a light/positive ' +
  'beat, "thud" for something serious or dramatic, "pop" for a quick punchy transition, "whoosh-out" for a closing ' +
  "scene. Omit the array or leave it empty for scenes that don't need one.";

export interface GetSoundEffectInput {
  name: SoundEffectName;
}

/**
 * Produces a local audio file for a short sound-effect accent, played at
 * the start of a scene alongside its narration. The only implementation
 * (GeneratedSoundEffectProvider) synthesizes it with ffmpeg, so this
 * works with no API key, no per-render cost, and no licensing risk.
 */
export interface SoundEffectProvider {
  getEffect(input: GetSoundEffectInput): Promise<string>;
}
