import { Router } from "express";
import { getAsset } from "@/controllers/asset.controller";
import { requireAuth } from "@/middleware/auth";
import { validate } from "@/middleware/validate";
import { IdParamSchema } from "@/schemas/requests";
import { asyncHandler } from "@/utils/asyncHandler";

export const assetsRouter = Router();

assetsRouter.use(requireAuth);
assetsRouter.get("/:id", validate(IdParamSchema, "params"), asyncHandler(getAsset));
