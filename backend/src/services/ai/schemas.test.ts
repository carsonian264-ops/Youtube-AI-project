import { ProjectPlanSchema, QualityCheckSchema, SceneSchema } from "./schemas";

describe("SceneSchema", () => {
  it("accepts a valid scene and applies defaults", () => {
    const result = SceneSchema.safeParse({
      sceneNumber: 1,
      title: "Hook",
      narration: "Did you know...",
      visualDescription: "A person looking surprised",
      visualPrompt: "surprised person, flat illustration",
      durationSeconds: 5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.soundEffects).toEqual([]);
      expect(result.data.transition).toBe("cut");
    }
  });

  it("rejects a scene with a non-positive duration", () => {
    const result = SceneSchema.safeParse({
      sceneNumber: 1,
      title: "Hook",
      narration: "x",
      visualDescription: "x",
      visualPrompt: "x",
      durationSeconds: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a scene missing required narration", () => {
    const result = SceneSchema.safeParse({
      sceneNumber: 1,
      title: "Hook",
      visualDescription: "x",
      visualPrompt: "x",
      durationSeconds: 5,
    });
    expect(result.success).toBe(false);
  });
});

describe("ProjectPlanSchema", () => {
  const validScene = {
    sceneNumber: 1,
    title: "Hook",
    narration: "x",
    visualDescription: "x",
    visualPrompt: "x",
    durationSeconds: 5,
  };

  it("rejects a plan with zero scenes", () => {
    const result = ProjectPlanSchema.safeParse({
      title: "t",
      concept: "c",
      targetAudience: "a",
      estimatedDurationSeconds: 60,
      tone: "confident",
      scenes: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a plan with at least one scene", () => {
    const result = ProjectPlanSchema.safeParse({
      title: "t",
      concept: "c",
      targetAudience: "a",
      estimatedDurationSeconds: 60,
      tone: "confident",
      scenes: [validScene],
    });
    expect(result.success).toBe(true);
  });
});

describe("QualityCheckSchema", () => {
  it("defaults issues to an empty array when omitted", () => {
    const result = QualityCheckSchema.safeParse({ passed: true, score: 100, summary: "ok" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.issues).toEqual([]);
    }
  });

  it("rejects a score outside 0-100", () => {
    const result = QualityCheckSchema.safeParse({ passed: true, score: 150, summary: "ok" });
    expect(result.success).toBe(false);
  });
});
