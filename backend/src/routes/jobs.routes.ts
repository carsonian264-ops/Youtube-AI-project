import { Router } from "express";
import { getJob } from "@/controllers/job.controller";
import { requireAuth } from "@/middleware/auth";
import { validate } from "@/middleware/validate";
import { IdParamSchema } from "@/schemas/requests";
import { asyncHandler } from "@/utils/asyncHandler";

export const jobsRouter = Router();

jobsRouter.use(requireAuth);
jobsRouter.get("/:id", validate(IdParamSchema, "params"), asyncHandler(getJob));
