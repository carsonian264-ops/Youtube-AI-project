import { requiredParam } from "@/utils/params";
import type { Request, Response } from "express";
import { google } from "googleapis";
import { prisma } from "@/db/prisma";
import { env } from "@/config/env";
import { projectService } from "@/services/project/ProjectService";
import { enqueueJob } from "@/queues/enqueue";
import { encryptSecret } from "@/utils/crypto";
import { AppError, NotFoundError } from "@/utils/errors";

const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];

function oauthClient() {
  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET || !env.YOUTUBE_REDIRECT_URI) {
    throw new AppError(
      "YouTube publishing is not configured on this server (missing YOUTUBE_CLIENT_ID/SECRET/REDIRECT_URI)",
      501,
      "NOT_CONFIGURED",
    );
  }
  return new google.auth.OAuth2(env.YOUTUBE_CLIENT_ID, env.YOUTUBE_CLIENT_SECRET, env.YOUTUBE_REDIRECT_URI);
}

/** Step 1 of Google OAuth: redirect the user to Google's consent screen. Never asks for a YouTube password. */
export async function startOAuth(req: Request, res: Response): Promise<void> {
  const client = oauthClient();
  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: req.user!.id,
  });
  res.status(200).json({ url });
}

/** Step 2: Google redirects back here with a one-time code; we exchange it for tokens and store them encrypted. */
export async function oauthCallback(req: Request, res: Response): Promise<void> {
  const client = oauthClient();
  const code = req.query.code as string;
  const userId = req.query.state as string;

  const { tokens } = await client.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new AppError("Google did not return the expected OAuth tokens", 502, "OAUTH_ERROR");
  }

  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data: profile } = await oauth2.userinfo.get();

  const youtube = google.youtube({ version: "v3", auth: client });
  const channels = await youtube.channels.list({ part: ["snippet"], mine: true });
  const channel = channels.data.items?.[0];

  await prisma.youtubeAccount.upsert({
    where: { userId_googleAccountId: { userId, googleAccountId: profile.id ?? "unknown" } },
    create: {
      userId,
      googleAccountId: profile.id ?? "unknown",
      accessTokenEnc: encryptSecret(tokens.access_token),
      refreshTokenEnc: encryptSecret(tokens.refresh_token),
      scope: tokens.scope,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      channelId: channel?.id ?? undefined,
      channelTitle: channel?.snippet?.title ?? undefined,
    },
    update: {
      accessTokenEnc: encryptSecret(tokens.access_token),
      refreshTokenEnc: encryptSecret(tokens.refresh_token),
      scope: tokens.scope,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      channelId: channel?.id ?? undefined,
      channelTitle: channel?.snippet?.title ?? undefined,
    },
  });

  res.redirect(`${env.FRONTEND_URL}/settings?youtube=connected`);
}

export async function listYoutubeAccounts(req: Request, res: Response): Promise<void> {
  const accounts = await prisma.youtubeAccount.findMany({
    where: { userId: req.user!.id },
    select: { id: true, channelId: true, channelTitle: true, createdAt: true },
  });
  res.status(200).json(accounts);
}

/**
 * Creates a PublishingJob (requiring explicit confirmed=true in the
 * request body) and enqueues the actual upload. This is the only path
 * that can ever result in a video being published -- the pipeline never
 * reaches this on its own.
 */
export async function publishToYoutube(req: Request, res: Response): Promise<void> {
  const project = await projectService.getOwned(req.user!.id, requiredParam(req, "id"));

  if (project.status !== "READY_FOR_REVIEW") {
    throw new AppError(
      `Project must be READY_FOR_REVIEW before publishing (currently ${project.status})`,
      409,
      "INVALID_STATE_TRANSITION",
    );
  }

  const account = await prisma.youtubeAccount.findUnique({ where: { id: req.body.youtubeAccountId } });
  if (!account || account.userId !== req.user!.id) {
    throw new NotFoundError("YouTube account");
  }

  const publishingJob = await prisma.publishingJob.create({
    data: {
      projectId: project.id,
      youtubeAccountId: account.id,
      title: req.body.title,
      description: req.body.description,
      tags: req.body.tags ?? [],
      visibility: req.body.visibility ?? "PRIVATE",
      confirmedByUser: true,
      status: "PENDING",
    },
  });

  const job = await enqueueJob({
    projectId: project.id,
    type: "PUBLISHING",
    payload: { publishingJobId: publishingJob.id },
  });

  res.status(202).json({ publishingJobId: publishingJob.id, jobId: job.id });
}

export async function getPublishingJob(req: Request, res: Response): Promise<void> {
  const publishingJob = await prisma.publishingJob.findUnique({
    where: { id: requiredParam(req, "id") },
    include: { project: true },
  });
  if (!publishingJob) throw new NotFoundError("Publishing job");
  if (publishingJob.project.userId !== req.user!.id) throw new NotFoundError("Publishing job");
  const { project: _project, ...rest } = publishingJob;
  res.status(200).json(rest);
}
