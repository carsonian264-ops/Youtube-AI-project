import { MockAIContentProvider } from "./MockAIContentProvider";
import { CharacterBibleSchema, ProjectPlanSchema, QualityCheckSchema, SceneSchema, YoutubeMetadataSchema } from "./schemas";

describe("MockAIContentProvider", () => {
  const provider = new MockAIContentProvider();

  it("generates a project plan that satisfies ProjectPlanSchema", async () => {
    const plan = await provider.generateProjectPlan({ idea: "how compilers work", targetDurationSeconds: 90 });
    expect(ProjectPlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.scenes.length).toBeGreaterThan(0);
    expect(plan.scenes.map((s) => s.sceneNumber)).toEqual(plan.scenes.map((_, i) => i + 1));
  });

  it("generates a character bible that satisfies CharacterBibleSchema", async () => {
    const plan = await provider.generateProjectPlan({ idea: "topic" });
    const bible = await provider.generateCharacterBible(plan);
    expect(CharacterBibleSchema.safeParse(bible).success).toBe(true);
  });

  it("regenerates a scene, preserving its scene number", async () => {
    const plan = await provider.generateProjectPlan({ idea: "topic", targetDurationSeconds: 90 });
    const bible = await provider.generateCharacterBible(plan);
    const regenerated = await provider.regenerateScene({
      plan,
      characterBible: bible,
      sceneNumber: 1,
      instructions: "make it punchier",
    });
    expect(SceneSchema.safeParse(regenerated).success).toBe(true);
    expect(regenerated.sceneNumber).toBe(1);
    expect(regenerated.narration).toContain("make it punchier");
  });

  it("generates YouTube metadata within YouTube's length limits", async () => {
    const plan = await provider.generateProjectPlan({ idea: "topic" });
    const metadata = await provider.generateYoutubeMetadata(plan);
    expect(YoutubeMetadataSchema.safeParse(metadata).success).toBe(true);
    expect(metadata.title.length).toBeLessThanOrEqual(100);
  });

  it("writes a real hook (curiosity/claim/question) instead of the old generic preamble", async () => {
    const plan = await provider.generateProjectPlan({ idea: "how compilers work", targetDurationSeconds: 90 });
    const hook = plan.scenes.find((s) => s.sceneNumber === 1)!.narration;
    expect(hook).not.toContain("Here's what most people get wrong about:");
    expect(hook.toLowerCase()).not.toMatch(/^(in this video|today we'll)/);
  });

  it("writes a real call to action (a concrete ask) instead of the old vague closer", async () => {
    const plan = await provider.generateProjectPlan({ idea: "how compilers work", targetDurationSeconds: 90 });
    const cta = plan.scenes.at(-1)!.narration;
    expect(cta).not.toBe("If this was useful, the next step is up to you.");
    expect(cta.toLowerCase()).toMatch(/subscribe|comment/);
  });

  it("varies the hook and CTA wording across different ideas instead of always the same template", async () => {
    const ideas = ["topic one", "a completely different topic", "yet another idea entirely, quite long"];
    const hooks = new Set<string>();
    const ctas = new Set<string>();
    for (const idea of ideas) {
      const plan = await provider.generateProjectPlan({ idea, targetDurationSeconds: 90 });
      hooks.add(plan.scenes[0]!.narration.replace(idea, "IDEA"));
      ctas.add(plan.scenes.at(-1)!.narration.replace(idea, "IDEA"));
    }
    expect(hooks.size).toBeGreaterThan(1);
    expect(ctas.size).toBeGreaterThan(1);
  });

  it("flags a script with empty narration in the quality check", async () => {
    const plan = await provider.generateProjectPlan({ idea: "topic", targetDurationSeconds: 90 });
    const firstScene = plan.scenes.find((s) => s.sceneNumber === 1);
    if (!firstScene) throw new Error("expected at least one scene");
    firstScene.narration = "";
    const bible = await provider.generateCharacterBible(plan);
    const result = await provider.runQualityCheck({ plan, characterBible: bible });
    expect(QualityCheckSchema.safeParse(result).success).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.severity === "high")).toBe(true);
  });
});
