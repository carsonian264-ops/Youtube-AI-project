import { z } from "zod";

/**
 * Structured output contracts for everything Claude produces. The backend
 * never trusts free-form AI text for anything it needs to act on
 * programmatically -- every AI response is parsed as JSON and validated
 * against one of these schemas before it touches the database. See
 * AI_PIPELINE.md for the retry/validation policy.
 */

export const SceneSchema = z.object({
  sceneNumber: z.number().int().positive(),
  title: z.string().min(1).max(160),
  narration: z.string().min(1),
  visualDescription: z.string().min(1),
  visualPrompt: z.string().min(1),
  cameraDirection: z.string().optional().default(""),
  durationSeconds: z.number().positive().max(120),
  soundEffects: z.array(z.string()).default([]),
  transition: z.string().optional().default("cut"),
});
export type Scene = z.infer<typeof SceneSchema>;

export const ProjectPlanSchema = z.object({
  title: z.string().min(1).max(160),
  concept: z.string().min(1),
  targetAudience: z.string().min(1),
  estimatedDurationSeconds: z.number().int().positive(),
  tone: z.string().min(1),
  scenes: z.array(SceneSchema).min(1),
});
export type ProjectPlan = z.infer<typeof ProjectPlanSchema>;

export const CharacterBibleEntrySchema = z.object({
  name: z.string().min(1),
  appearance: z.string().min(1),
  clothing: z.string().optional().default(""),
  personality: z.string().optional().default(""),
  ageCategory: z.string().optional().default(""),
  colors: z.array(z.string()).default([]),
  visualStyle: z.string().optional().default(""),
  environment: z.string().optional().default(""),
  recurringObjects: z.array(z.string()).default([]),
});
export type CharacterBibleEntry = z.infer<typeof CharacterBibleEntrySchema>;

export const CharacterBibleSchema = z.object({
  characters: z.array(CharacterBibleEntrySchema).default([]),
});
export type CharacterBible = z.infer<typeof CharacterBibleSchema>;

export const YoutubeMetadataSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(5000),
  tags: z.array(z.string()).max(500).default([]),
});
export type YoutubeMetadata = z.infer<typeof YoutubeMetadataSchema>;

export const QualityCheckSchema = z.object({
  passed: z.boolean(),
  score: z.number().min(0).max(100),
  issues: z
    .array(
      z.object({
        severity: z.enum(["low", "medium", "high"]),
        description: z.string(),
        sceneNumber: z.number().int().positive().optional(),
      }),
    )
    .default([]),
  summary: z.string(),
});
export type QualityCheck = z.infer<typeof QualityCheckSchema>;
