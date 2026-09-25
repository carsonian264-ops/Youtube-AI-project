import type { z } from "zod";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { AIResponseValidationError, ProviderError } from "@/utils/errors";
import type {
  AIContentProvider,
  GenerateProjectPlanInput,
  QualityCheckInput,
  RegenerateSceneInput,
} from "./AIContentProvider";
import {
  CharacterBibleSchema,
  ProjectPlanSchema,
  QualityCheckSchema,
  SceneSchema,
  YoutubeMetadataSchema,
  type CharacterBible,
  type ProjectPlan,
  type QualityCheck,
  type Scene,
  type YoutubeMetadata,
} from "./schemas";

const MAX_ATTEMPTS = 3;

export interface GeminiUsageEvent {
  operation: string;
  inputTokens: number;
  outputTokens: number;
}

export interface GeminiProviderOptions {
  apiKey: string;
  model?: string;
  onUsage?: (event: GeminiUsageEvent) => void;
}

/**
 * Free-tier implementation of AIContentProvider using Google's Gemini
 * API (no card required for the free tier, unlike Claude's pay-as-you-go
 * API or Pollinations' text endpoint, which our own testing found
 * requires a funded balance same as its voice endpoint). Uses Gemini's
 * native JSON mode (generationConfig.responseMimeType) so the model's
 * raw output is already strict JSON, then validates it against the same
 * Zod schemas ClaudeProvider uses, with the same retry-with-feedback
 * loop on validation failure.
 */
export class GeminiProvider implements AIContentProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly onUsage?: (event: GeminiUsageEvent) => void;

  constructor(options: GeminiProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? env.GEMINI_MODEL;
    this.onUsage = options.onUsage;
  }

  private async requestStructured<T>(
    operation: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<T> {
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const prompt = lastError
        ? `${userPrompt}\n\nYour previous response failed validation with this error:\n${lastError}\nReturn corrected JSON only.`
        : userPrompt;

      let rawText: string;
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, {
          method: "POST",
          headers: {
            "x-goog-api-key": this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { responseMimeType: "application/json" },
          }),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          // 429 (rate limit / free-tier daily quota exhausted) is just as
          // much "this provider can't serve us right now" as a 5xx -- an
          // immediate retry won't help either, but the caller falling
          // back to another provider (see FallbackAIContentProvider)
          // will. Only a genuine client error (bad request, bad API key)
          // should be treated as non-retryable.
          const retryable = res.status >= 500 || res.status === 429;
          throw new ProviderError("gemini", `Gemini API request failed (${res.status}): ${body}`, retryable);
        }

        const json = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        };

        this.onUsage?.({
          operation,
          inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
        });

        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          throw new AIResponseValidationError(`Gemini returned no text content for ${operation}`);
        }
        rawText = text;
      } catch (err) {
        if (err instanceof AIResponseValidationError || err instanceof ProviderError) throw err;
        logger.error({ err, operation, attempt }, "Gemini API request failed");
        throw new ProviderError("gemini", err instanceof Error ? err.message : "Unknown Gemini API error", true);
      }

      const parsed = safeJsonParse(rawText);
      if (!parsed.ok) {
        lastError = `Response was not valid JSON: ${parsed.error}`;
        logger.warn({ operation, attempt, error: lastError }, "Gemini response failed JSON parsing, retrying");
        continue;
      }

      const validated = schema.safeParse(parsed.value);
      if (!validated.success) {
        lastError = validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        logger.warn({ operation, attempt, error: lastError }, "Gemini response failed schema validation, retrying");
        continue;
      }

      return validated.data;
    }

    logger.error({ operation, lastError }, "Gemini response failed validation after all retries");
    throw new AIResponseValidationError(
      `Gemini failed to produce a valid ${operation} response after ${MAX_ATTEMPTS} attempts`,
      { lastError },
    );
  }

  async generateProjectPlan(input: GenerateProjectPlanInput): Promise<ProjectPlan> {
    const system =
      "You are a professional video content strategist and scriptwriter. " +
      "You break down a video idea into a structured production plan with a scene-by-scene script.";
    const user = [
      `Video idea: "${input.idea}"`,
      input.targetDurationSeconds ? `Target duration: ${input.targetDurationSeconds} seconds.` : "",
      input.tone ? `Desired tone: ${input.tone}.` : "",
      "",
      "Return a JSON object matching this shape exactly:",
      "{ title, concept, targetAudience, estimatedDurationSeconds, tone,",
      "  scenes: [{ sceneNumber, title, narration, visualDescription, visualPrompt,",
      "             cameraDirection, durationSeconds, soundEffects: string[], transition }] }",
      "Scene numbers start at 1 and are sequential. Keep narration natural for voiceover.",
    ]
      .filter(Boolean)
      .join("\n");

    return this.requestStructured("generateProjectPlan", ProjectPlanSchema, system, user);
  }

  async generateCharacterBible(plan: ProjectPlan): Promise<CharacterBible> {
    const system =
      "You extract recurring characters/subjects from a video script and describe them precisely " +
      "so an image generator can render them consistently across every scene.";
    const user = [
      "Script (JSON):",
      JSON.stringify(plan),
      "",
      "Identify every recurring character, host, mascot, or visually-consistent subject.",
      "Return JSON: { characters: [{ name, appearance, clothing, personality, ageCategory,",
      "  colors: string[], visualStyle, environment, recurringObjects: string[] }] }",
      "If there are no recurring characters (e.g. a pure explainer with only on-screen text/b-roll),",
      "return { characters: [] }.",
    ].join("\n");

    return this.requestStructured("generateCharacterBible", CharacterBibleSchema, system, user);
  }

  async regenerateScene(input: RegenerateSceneInput): Promise<Scene> {
    const existing = input.plan.scenes.find((s) => s.sceneNumber === input.sceneNumber);
    const system =
      "You rewrite a single scene of a video script, keeping it consistent with the rest of the " +
      "script and the established character/visual bible.";
    const user = [
      `Full script (JSON): ${JSON.stringify(input.plan)}`,
      `Character/visual bible (JSON): ${JSON.stringify(input.characterBible)}`,
      `Scene to regenerate: ${input.sceneNumber}`,
      existing ? `Current version of this scene: ${JSON.stringify(existing)}` : "",
      input.instructions ? `Instructions for the rewrite: ${input.instructions}` : "",
      "",
      "Return JSON for exactly one scene:",
      "{ sceneNumber, title, narration, visualDescription, visualPrompt, cameraDirection,",
      "  durationSeconds, soundEffects: string[], transition }",
    ]
      .filter(Boolean)
      .join("\n");

    return this.requestStructured("regenerateScene", SceneSchema, system, user);
  }

  async generateYoutubeMetadata(plan: ProjectPlan): Promise<YoutubeMetadata> {
    const system = "You write high-CTR, non-clickbait YouTube titles, descriptions, and tags.";
    const user = [
      `Script (JSON): ${JSON.stringify(plan)}`,
      "",
      "Return JSON: { title (<=100 chars), description (<=5000 chars, include a short summary,",
      "  key points, and a call to action), tags: string[] }",
    ].join("\n");

    return this.requestStructured("generateYoutubeMetadata", YoutubeMetadataSchema, system, user);
  }

  async runQualityCheck(input: QualityCheckInput): Promise<QualityCheck> {
    const system =
      "You are a strict quality-control reviewer for AI-generated video scripts. You check for " +
      "factual red flags, tone consistency, pacing issues, and continuity errors between scenes " +
      "and the character/visual bible.";
    const user = [
      `Script (JSON): ${JSON.stringify(input.plan)}`,
      `Character/visual bible (JSON): ${JSON.stringify(input.characterBible)}`,
      "",
      "Return JSON: { passed: boolean, score: 0-100, issues: [{ severity: low|medium|high,",
      "  description, sceneNumber? }], summary }",
    ].join("\n");

    return this.requestStructured("runQualityCheck", QualityCheckSchema, system, user);
  }
}

function safeJsonParse(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return { ok: true, value: JSON.parse(cleaned) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown parse error" };
  }
}
