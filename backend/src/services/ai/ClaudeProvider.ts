import Anthropic from "@anthropic-ai/sdk";
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

export interface ClaudeUsageEvent {
  operation: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ClaudeProviderOptions {
  apiKey: string;
  model?: string;
  onUsage?: (event: ClaudeUsageEvent) => void;
}

/**
 * Real Anthropic Claude implementation of AIContentProvider. Claude is
 * instructed to return raw JSON only; every response is parsed and
 * validated against the matching Zod schema in ./schemas before it is
 * trusted. On invalid JSON/schema failures we retry with the validation
 * error fed back to the model, up to MAX_ATTEMPTS, then surface a
 * typed error.
 */
export class ClaudeProvider implements AIContentProvider {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly onUsage?: (event: ClaudeUsageEvent) => void;

  constructor(options: ClaudeProviderOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model ?? env.ANTHROPIC_MODEL;
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
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          system: `${systemPrompt}\n\nRespond with ONLY valid JSON. No markdown fences, no prose before or after.`,
          messages: [{ role: "user", content: prompt }],
        });

        this.onUsage?.({
          operation,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        });

        const textBlock = response.content.find((block) => block.type === "text");
        if (!textBlock || textBlock.type !== "text") {
          throw new AIResponseValidationError(`Claude returned no text content for ${operation}`);
        }
        rawText = textBlock.text;
      } catch (err) {
        if (err instanceof AIResponseValidationError) throw err;
        logger.error({ err, operation, attempt }, "Claude API request failed");
        throw new ProviderError("claude", err instanceof Error ? err.message : "Unknown Claude API error", true);
      }

      const parsed = safeJsonParse(rawText);
      if (!parsed.ok) {
        lastError = `Response was not valid JSON: ${parsed.error}`;
        logger.warn({ operation, attempt, error: lastError }, "Claude response failed JSON parsing, retrying");
        continue;
      }

      const validated = schema.safeParse(parsed.value);
      if (!validated.success) {
        lastError = validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        logger.warn({ operation, attempt, error: lastError }, "Claude response failed schema validation, retrying");
        continue;
      }

      return validated.data;
    }

    logger.error({ operation, lastError }, "Claude response failed validation after all retries");
    throw new AIResponseValidationError(
      `Claude failed to produce a valid ${operation} response after ${MAX_ATTEMPTS} attempts`,
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
