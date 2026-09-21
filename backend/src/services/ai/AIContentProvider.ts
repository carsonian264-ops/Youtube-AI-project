import type { CharacterBible, ProjectPlan, QualityCheck, Scene, YoutubeMetadata } from "./schemas";

export interface GenerateProjectPlanInput {
  idea: string;
  targetDurationSeconds?: number;
  tone?: string;
}

export interface RegenerateSceneInput {
  plan: ProjectPlan;
  characterBible: CharacterBible;
  sceneNumber: number;
  instructions?: string;
}

export interface QualityCheckInput {
  plan: ProjectPlan;
  characterBible: CharacterBible;
}

/**
 * Everything the rest of the application knows about "the AI". No caller
 * outside this module may import Anthropic's SDK directly -- they depend
 * on this interface so the provider can be swapped (or mocked in tests
 * and local dev) without touching business logic. See ARCHITECTURE.md
 * section "Provider abstractions".
 */
export interface AIContentProvider {
  generateProjectPlan(input: GenerateProjectPlanInput): Promise<ProjectPlan>;
  generateCharacterBible(plan: ProjectPlan): Promise<CharacterBible>;
  regenerateScene(input: RegenerateSceneInput): Promise<Scene>;
  generateYoutubeMetadata(plan: ProjectPlan): Promise<YoutubeMetadata>;
  runQualityCheck(input: QualityCheckInput): Promise<QualityCheck>;
}
