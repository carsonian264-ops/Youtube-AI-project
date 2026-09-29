import { logger } from "@/utils/logger";
import { AIResponseValidationError, ProviderError } from "@/utils/errors";
import type {
  AIContentProvider,
  GenerateProjectPlanInput,
  QualityCheckInput,
  RegenerateSceneInput,
} from "./AIContentProvider";
import type { CharacterBible, ProjectPlan, QualityCheck, Scene, YoutubeMetadata } from "./schemas";

/**
 * Wraps a real AIContentProvider so a transient upstream failure (an
 * outage, a rate limit, a "high demand" 503 -- see GeminiProvider) or a
 * persistently malformed response degrades to the mock provider instead
 * of failing the whole pipeline run. Only kicks in for errors that mean
 * *the AI service itself* is having trouble right now; a rejected API key
 * or an unexpected bug still throws normally so it isn't silently papered
 * over.
 *
 * A bare `ProviderError` marked retryable (a 503/429 -- the request never
 * even got a response) gets one retry after a short delay before falling
 * back: "currently experiencing high demand" is usually gone within a few
 * seconds, and retrying costs one short delay against getting a real
 * script instead of silently degrading every single generation to mock
 * output. An `AIResponseValidationError` skips this extra retry and falls
 * back immediately, since GeminiProvider/ClaudeProvider's own
 * requestStructured() loop already retried that same request (with the
 * validation error fed back to the model) up to 3 times internally before
 * ever throwing it -- retrying again here at the same unmodified prompt
 * is very unlikely to succeed where those already didn't.
 */
export class FallbackAIContentProvider implements AIContentProvider {
  constructor(
    private readonly primary: AIContentProvider,
    private readonly fallback: AIContentProvider,
    private readonly primaryName: string,
    private readonly retryDelayMs = 2000,
  ) {}

  generateProjectPlan(input: GenerateProjectPlanInput): Promise<ProjectPlan> {
    return this.run(
      "generateProjectPlan",
      () => this.primary.generateProjectPlan(input),
      () => this.fallback.generateProjectPlan(input),
    );
  }

  generateCharacterBible(plan: ProjectPlan): Promise<CharacterBible> {
    return this.run(
      "generateCharacterBible",
      () => this.primary.generateCharacterBible(plan),
      () => this.fallback.generateCharacterBible(plan),
    );
  }

  regenerateScene(input: RegenerateSceneInput): Promise<Scene> {
    return this.run(
      "regenerateScene",
      () => this.primary.regenerateScene(input),
      () => this.fallback.regenerateScene(input),
    );
  }

  generateYoutubeMetadata(plan: ProjectPlan): Promise<YoutubeMetadata> {
    return this.run(
      "generateYoutubeMetadata",
      () => this.primary.generateYoutubeMetadata(plan),
      () => this.fallback.generateYoutubeMetadata(plan),
    );
  }

  runQualityCheck(input: QualityCheckInput): Promise<QualityCheck> {
    return this.run(
      "runQualityCheck",
      () => this.primary.runQualityCheck(input),
      () => this.fallback.runQualityCheck(input),
    );
  }

  private async run<T>(operation: string, callPrimary: () => Promise<T>, callFallback: () => Promise<T>): Promise<T> {
    try {
      return await callPrimary();
    } catch (err) {
      if (isTransientProviderError(err)) {
        logger.warn(
          { provider: this.primaryName, operation, err },
          `${this.primaryName} failed for ${operation} with a transient error; retrying once before falling back`,
        );
        await sleep(this.retryDelayMs);
        try {
          return await callPrimary();
        } catch (retryErr) {
          if (!isFallbackEligible(retryErr)) throw retryErr;
          logger.warn(
            { provider: this.primaryName, operation, err: retryErr },
            `${this.primaryName} failed again for ${operation}; falling back to the mock AI provider`,
          );
          return callFallback();
        }
      }

      if (!isFallbackEligible(err)) throw err;
      logger.warn(
        { provider: this.primaryName, operation, err },
        `${this.primaryName} failed for ${operation}; falling back to the mock AI provider`,
      );
      return callFallback();
    }
  }
}

function isTransientProviderError(err: unknown): boolean {
  return err instanceof ProviderError && err.retryable;
}

function isFallbackEligible(err: unknown): boolean {
  if (err instanceof ProviderError) return err.retryable;
  if (err instanceof AIResponseValidationError) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
