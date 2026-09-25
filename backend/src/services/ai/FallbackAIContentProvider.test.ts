import { FallbackAIContentProvider } from "./FallbackAIContentProvider";
import { AIResponseValidationError, ProviderError } from "@/utils/errors";
import type { AIContentProvider } from "./AIContentProvider";
import type { CharacterBible, ProjectPlan, QualityCheck, Scene, YoutubeMetadata } from "./schemas";

const PLAN: ProjectPlan = {
  title: "Test",
  concept: "test",
  targetAudience: "everyone",
  estimatedDurationSeconds: 60,
  tone: "confident",
  scenes: [],
};
const BIBLE: CharacterBible = { characters: [] };
const SCENE: Scene = {
  sceneNumber: 1,
  title: "Hook",
  narration: "n",
  visualDescription: "v",
  visualPrompt: "v",
  cameraDirection: "static wide",
  durationSeconds: 5,
  soundEffects: [],
  transition: "cut",
};
const METADATA: YoutubeMetadata = { title: "Test", description: "desc", tags: [] };
const QUALITY: QualityCheck = { passed: true, score: 100, issues: [], summary: "ok" };

function fakeProvider(overrides: Partial<AIContentProvider> = {}): AIContentProvider {
  return {
    generateProjectPlan: jest.fn().mockResolvedValue(PLAN),
    generateCharacterBible: jest.fn().mockResolvedValue(BIBLE),
    regenerateScene: jest.fn().mockResolvedValue(SCENE),
    generateYoutubeMetadata: jest.fn().mockResolvedValue(METADATA),
    runQualityCheck: jest.fn().mockResolvedValue(QUALITY),
    ...overrides,
  };
}

describe("FallbackAIContentProvider", () => {
  it("returns the primary provider's result without touching the fallback when the primary succeeds", async () => {
    const primary = fakeProvider();
    const fallback = fakeProvider();
    const provider = new FallbackAIContentProvider(primary, fallback, "gemini");

    const result = await provider.generateProjectPlan({ idea: "topic" });

    expect(result).toBe(PLAN);
    expect(fallback.generateProjectPlan).not.toHaveBeenCalled();
  });

  it("falls back to the secondary provider on a retryable ProviderError", async () => {
    const primary = fakeProvider({
      generateProjectPlan: jest.fn().mockRejectedValue(new ProviderError("gemini", "high demand", true)),
    });
    const fallback = fakeProvider();
    const provider = new FallbackAIContentProvider(primary, fallback, "gemini");

    const result = await provider.generateProjectPlan({ idea: "topic" });

    expect(result).toBe(PLAN);
    expect(fallback.generateProjectPlan).toHaveBeenCalledWith({ idea: "topic" });
  });

  it("falls back to the secondary provider when the primary keeps returning invalid output", async () => {
    const primary = fakeProvider({
      generateCharacterBible: jest.fn().mockRejectedValue(new AIResponseValidationError("bad json")),
    });
    const fallback = fakeProvider();
    const provider = new FallbackAIContentProvider(primary, fallback, "claude");

    const result = await provider.generateCharacterBible(PLAN);

    expect(result).toBe(BIBLE);
    expect(fallback.generateCharacterBible).toHaveBeenCalledWith(PLAN);
  });

  it("does NOT fall back on a non-retryable ProviderError (e.g. an invalid API key)", async () => {
    const authError = new ProviderError("gemini", "invalid API key", false);
    const primary = fakeProvider({ generateProjectPlan: jest.fn().mockRejectedValue(authError) });
    const fallback = fakeProvider();
    const provider = new FallbackAIContentProvider(primary, fallback, "gemini");

    await expect(provider.generateProjectPlan({ idea: "topic" })).rejects.toBe(authError);
    expect(fallback.generateProjectPlan).not.toHaveBeenCalled();
  });

  it("does NOT fall back on an unrelated/unexpected error", async () => {
    const bug = new TypeError("cannot read property of undefined");
    const primary = fakeProvider({ generateProjectPlan: jest.fn().mockRejectedValue(bug) });
    const fallback = fakeProvider();
    const provider = new FallbackAIContentProvider(primary, fallback, "gemini");

    await expect(provider.generateProjectPlan({ idea: "topic" })).rejects.toBe(bug);
    expect(fallback.generateProjectPlan).not.toHaveBeenCalled();
  });

  it("falls back correctly for every method on the interface", async () => {
    const retryable = () => new ProviderError("gemini", "unavailable", true);
    const primary = fakeProvider({
      generateProjectPlan: jest.fn().mockRejectedValue(retryable()),
      generateCharacterBible: jest.fn().mockRejectedValue(retryable()),
      regenerateScene: jest.fn().mockRejectedValue(retryable()),
      generateYoutubeMetadata: jest.fn().mockRejectedValue(retryable()),
      runQualityCheck: jest.fn().mockRejectedValue(retryable()),
    });
    const fallback = fakeProvider();
    const provider = new FallbackAIContentProvider(primary, fallback, "gemini");

    await expect(provider.generateProjectPlan({ idea: "topic" })).resolves.toBe(PLAN);
    await expect(provider.generateCharacterBible(PLAN)).resolves.toBe(BIBLE);
    await expect(
      provider.regenerateScene({ plan: PLAN, characterBible: BIBLE, sceneNumber: 1 }),
    ).resolves.toBe(SCENE);
    await expect(provider.generateYoutubeMetadata(PLAN)).resolves.toBe(METADATA);
    await expect(provider.runQualityCheck({ plan: PLAN, characterBible: BIBLE })).resolves.toBe(QUALITY);
  });
});
