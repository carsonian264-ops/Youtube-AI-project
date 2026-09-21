import { z } from "zod";

/** Request-body/param/query validation schemas for every API route. */

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(120).optional(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const CreateProjectSchema = z.object({
  title: z.string().min(1).max(200),
  concept: z.string().min(1).max(2000),
  targetAudience: z.string().max(300).optional(),
  tone: z.string().max(200).optional(),
  estimatedDurationSeconds: z.number().int().positive().max(3600).optional(),
  aspectRatio: z.enum(["LANDSCAPE_16_9", "PORTRAIT_9_16", "SQUARE_1_1"]).optional(),
});

export const UpdateProjectSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  targetAudience: z.string().max(300).optional(),
  tone: z.string().max(200).optional(),
  aspectRatio: z.enum(["LANDSCAPE_16_9", "PORTRAIT_9_16", "SQUARE_1_1"]).optional(),
});

export const IdParamSchema = z.object({
  id: z.string().uuid(),
});

export const GenerateProjectSchema = z.object({
  targetDurationSeconds: z.number().int().positive().max(3600).optional(),
  tone: z.string().max(200).optional(),
});

export const RegenerateSceneSchema = z.object({
  instructions: z.string().max(1000).optional(),
});

export const RenderProjectSchema = z.object({
  aspectRatio: z.enum(["LANDSCAPE_16_9", "PORTRAIT_9_16", "SQUARE_1_1"]).optional(),
});

export const YoutubePublishSchema = z.object({
  youtubeAccountId: z.string().uuid(),
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(5000),
  tags: z.array(z.string()).max(500).default([]),
  visibility: z.enum(["PRIVATE", "UNLISTED", "PUBLIC"]).default("PRIVATE"),
  confirmed: z.literal(true, {
    errorMap: () => ({ message: "You must explicitly confirm before publishing to YouTube" }),
  }),
});
