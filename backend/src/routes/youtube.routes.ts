import { Router } from "express";
import {
  getPublishingJob,
  getPublishingJobStats,
  listYoutubeAccounts,
  oauthCallback,
  startOAuth,
} from "@/controllers/youtube.controller";
import { requireAuth } from "@/middleware/auth";
import { validate } from "@/middleware/validate";
import { IdParamSchema } from "@/schemas/requests";
import { asyncHandler } from "@/utils/asyncHandler";

export const youtubeRouter = Router();

youtubeRouter.get("/oauth/start", requireAuth, asyncHandler(startOAuth));
// Google redirects here directly (no Authorization header available); the
// user's identity travels in the OAuth `state` parameter instead.
youtubeRouter.get("/oauth/callback", asyncHandler(oauthCallback));
youtubeRouter.get("/accounts", requireAuth, asyncHandler(listYoutubeAccounts));
youtubeRouter.get(
  "/publishing-jobs/:id",
  requireAuth,
  validate(IdParamSchema, "params"),
  asyncHandler(getPublishingJob),
);
youtubeRouter.get(
  "/publishing-jobs/:id/stats",
  requireAuth,
  validate(IdParamSchema, "params"),
  asyncHandler(getPublishingJobStats),
);
