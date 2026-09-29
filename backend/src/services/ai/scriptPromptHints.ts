/**
 * Shared prompt guidance for the two scenes that matter most for whether
 * anyone actually watches the video: the opening hook and the closing
 * call to action. Before this existed, generateProjectPlan's prompt only
 * said scene numbers start at 1 -- nothing told the model those two
 * specific scenes needed to work harder than the rest, so real providers
 * (Claude/Gemini) produced generic openings ("In this video...") and
 * bare "like and subscribe" closers with nothing attached to them.
 *
 * Kept as standalone exported constants (mirroring SOUND_EFFECT_PROMPT_HINT
 * in soundeffect/SoundEffectProvider.ts) so ClaudeProvider.ts and
 * GeminiProvider.ts can't drift apart on wording, and so regenerateScene
 * can include just the relevant one when the scene being rewritten is
 * specifically the hook or the CTA.
 */
export const HOOK_PROMPT_HINT =
  "Scene 1 is the hook: open with a curiosity gap, a surprising or counterintuitive claim, or a direct question " +
  "that creates a stake for the viewer. Get to the point in the first sentence -- never a generic preamble like " +
  '"In this video..." or "Today we\'ll talk about...".';

export const CTA_PROMPT_HINT =
  "The final scene is the call to action: end with one specific, concrete thing tied to this exact topic -- what " +
  "to try, what to watch for, or what to comment -- plus a reason to subscribe, never a bare \"like and subscribe\" " +
  "with nothing attached to it.";
