import { Router } from "express";
import { generateSceneVisual, generateSceneVoice, regenerateScene } from "@/controllers/scene.controller";
import { requireAuth } from "@/middleware/auth";
import { validate } from "@/middleware/validate";
import { IdParamSchema, RegenerateSceneSchema } from "@/schemas/requests";
import { asyncHandler } from "@/utils/asyncHandler";

export const scenesRouter = Router();

scenesRouter.use(requireAuth);

scenesRouter.post(
  "/:id/regenerate",
  validate(IdParamSchema, "params"),
  validate(RegenerateSceneSchema),
  asyncHandler(regenerateScene),
);
scenesRouter.post("/:id/visual", validate(IdParamSchema, "params"), asyncHandler(generateSceneVisual));
scenesRouter.post("/:id/voice", validate(IdParamSchema, "params"), asyncHandler(generateSceneVoice));
