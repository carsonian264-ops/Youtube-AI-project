import { Router } from "express";
import { getUsageSummary } from "@/controllers/usage.controller";
import { requireAuth } from "@/middleware/auth";
import { asyncHandler } from "@/utils/asyncHandler";

export const usageRouter = Router();

usageRouter.use(requireAuth);
usageRouter.get("/", asyncHandler(getUsageSummary));
