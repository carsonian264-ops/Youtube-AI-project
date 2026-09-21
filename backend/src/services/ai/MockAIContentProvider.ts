import type {
  AIContentProvider,
  GenerateProjectPlanInput,
  QualityCheckInput,
  RegenerateSceneInput,
} from "./AIContentProvider";
import type { CharacterBible, ProjectPlan, QualityCheck, Scene, YoutubeMetadata } from "./schemas";

/**
 * Deterministic, zero-cost, zero-network implementation of
 * AIContentProvider used for local development (AI_PROVIDER=mock, the
 * default) and in the test suite. It produces structurally valid output
 * so the rest of the pipeline (persistence, queues, rendering) can be
 * built and tested without spending real API credits.
 */
export class MockAIContentProvider implements AIContentProvider {
  async generateProjectPlan(input: GenerateProjectPlanInput): Promise<ProjectPlan> {
    const targetDuration = input.targetDurationSeconds ?? 180;
    const sceneCount = Math.max(3, Math.min(10, Math.round(targetDuration / 30)));
    const perScene = Math.floor(targetDuration / sceneCount);

    const scenes: Scene[] = Array.from({ length: sceneCount }, (_, i) => {
      const sceneNumber = i + 1;
      const isFirst = sceneNumber === 1;
      const isLast = sceneNumber === sceneCount;
      return {
        sceneNumber,
        title: isFirst ? "Hook" : isLast ? "Call to action" : `Beat ${sceneNumber - 1}`,
        narration: isFirst
          ? `Here's what most people get wrong about: ${input.idea}.`
          : isLast
            ? "If this was useful, the next step is up to you."
            : `Point ${sceneNumber - 1} about ${input.idea}, explained simply with a concrete example.`,
        visualDescription: `Clean, modern visual illustrating "${input.idea}" for scene ${sceneNumber}.`,
        visualPrompt: `Minimalist editorial illustration, scene ${sceneNumber}, subject: ${input.idea}, ${
          input.tone ?? "confident"
        } mood, flat color palette, no text overlay`,
        cameraDirection: isFirst ? "slow push-in" : "static wide",
        durationSeconds: perScene,
        soundEffects: isFirst ? ["whoosh-in"] : [],
        transition: isLast ? "fade-to-black" : "cut",
      };
    });

    return {
      title: `${capitalize(input.idea)}: What You Need to Know`,
      concept: input.idea,
      targetAudience: "Curious generalists and early adopters",
      estimatedDurationSeconds: targetDuration,
      tone: input.tone ?? "confident, clear, conversational",
      scenes,
    };
  }

  async generateCharacterBible(_plan: ProjectPlan): Promise<CharacterBible> {
    return {
      characters: [
        {
          name: "Host (voice-only)",
          appearance: "Not visually depicted; narration-driven explainer style",
          clothing: "",
          personality: "Direct, warm, confident",
          ageCategory: "adult",
          colors: ["#0EA5E9", "#111827", "#F9FAFB"],
          visualStyle: "flat minimalist editorial illustration",
          environment: "abstract studio backdrop",
          recurringObjects: [],
        },
      ],
    };
  }

  async regenerateScene(input: RegenerateSceneInput): Promise<Scene> {
    const existing = input.plan.scenes.find((s) => s.sceneNumber === input.sceneNumber);
    const base =
      existing ??
      ({
        sceneNumber: input.sceneNumber,
        title: `Scene ${input.sceneNumber}`,
        narration: "",
        visualDescription: "",
        visualPrompt: "",
        cameraDirection: "static wide",
        durationSeconds: 15,
        soundEffects: [],
        transition: "cut",
      } satisfies Scene);

    return {
      ...base,
      narration: input.instructions ? `${base.narration} (revised: ${input.instructions})` : base.narration,
      visualPrompt: input.instructions ? `${base.visualPrompt}, ${input.instructions}` : base.visualPrompt,
    };
  }

  async generateYoutubeMetadata(plan: ProjectPlan): Promise<YoutubeMetadata> {
    return {
      title: plan.title.slice(0, 100),
      description: [
        plan.concept,
        "",
        "In this video:",
        ...plan.scenes.map((s) => `- ${s.title}`),
        "",
        "Subscribe for more.",
      ].join("\n"),
      tags: [plan.tone, plan.targetAudience, "AI", "explainer"].filter(Boolean).slice(0, 10),
    };
  }

  async runQualityCheck(input: QualityCheckInput): Promise<QualityCheck> {
    const issues: QualityCheck["issues"] = [];
    if (input.plan.scenes.length < 2) {
      issues.push({ severity: "high", description: "Script has fewer than 2 scenes." });
    }
    for (const scene of input.plan.scenes) {
      if (!scene.narration.trim()) {
        issues.push({ severity: "high", description: "Scene has empty narration.", sceneNumber: scene.sceneNumber });
      }
    }
    const score = Math.max(0, 100 - issues.length * 20);
    return {
      passed: issues.every((i) => i.severity !== "high"),
      score,
      issues,
      summary: issues.length === 0 ? "No issues found." : `${issues.length} issue(s) found.`,
    };
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
