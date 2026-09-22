import { Router } from "express";
import {
  cancelProject,
  createProject,
  deleteProject,
  generateProject,
  getProject,
  getProjectStatus,
  listProjects,
  regenerateScript,
  renderProject,
  runQualityCheck,
  updateProject,
} from "@/controllers/project.controller";
import { publishToYoutube } from "@/controllers/youtube.controller";
import { requireAuth } from "@/middleware/auth";
import { validate } from "@/middleware/validate";
import {
  CreateProjectSchema,
  GenerateProjectSchema,
  IdParamSchema,
  RegenerateScriptSchema,
  RenderProjectSchema,
  UpdateProjectSchema,
  YoutubePublishSchema,
} from "@/schemas/requests";
import { asyncHandler } from "@/utils/asyncHandler";

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

projectsRouter.post("/", validate(CreateProjectSchema), asyncHandler(createProject));
projectsRouter.get("/", asyncHandler(listProjects));
projectsRouter.get("/:id", validate(IdParamSchema, "params"), asyncHandler(getProject));
projectsRouter.patch("/:id", validate(IdParamSchema, "params"), validate(UpdateProjectSchema), asyncHandler(updateProject));
projectsRouter.delete("/:id", validate(IdParamSchema, "params"), asyncHandler(deleteProject));

projectsRouter.post(
  "/:id/generate",
  validate(IdParamSchema, "params"),
  validate(GenerateProjectSchema),
  asyncHandler(generateProject),
);
projectsRouter.get("/:id/status", validate(IdParamSchema, "params"), asyncHandler(getProjectStatus));
projectsRouter.post("/:id/cancel", validate(IdParamSchema, "params"), asyncHandler(cancelProject));
projectsRouter.post(
  "/:id/script/regenerate",
  validate(IdParamSchema, "params"),
  validate(RegenerateScriptSchema),
  asyncHandler(regenerateScript),
);
projectsRouter.post(
  "/:id/render",
  validate(IdParamSchema, "params"),
  validate(RenderProjectSchema),
  asyncHandler(renderProject),
);
projectsRouter.post("/:id/quality-check", validate(IdParamSchema, "params"), asyncHandler(runQualityCheck));
projectsRouter.post(
  "/:id/youtube/publish",
  validate(IdParamSchema, "params"),
  validate(YoutubePublishSchema),
  asyncHandler(publishToYoutube),
);
