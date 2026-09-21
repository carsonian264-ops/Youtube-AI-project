import { requiredParam } from "@/utils/params";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { prisma } from "@/db/prisma";
import { enqueueJob } from "@/queues/enqueue";
import { AuthorizationError, NotFoundError } from "@/utils/errors";

async function getOwnedScene(userId: string, sceneId: string) {
  const scene = await prisma.scene.findUnique({ where: { id: sceneId }, include: { project: true } });
  if (!scene) throw new NotFoundError("Scene");
  if (scene.project.userId !== userId) throw new AuthorizationError();
  return scene;
}

export async function regenerateScene(req: Request, res: Response): Promise<void> {
  const scene = await getOwnedScene(req.user!.id, requiredParam(req, "id"));
  const pipelineRunId = randomUUID();
  const job = await enqueueJob({
    projectId: scene.projectId,
    type: "CONTENT_GENERATION",
    payload: { pipelineRunId, sceneOnly: true, sceneId: scene.id, instructions: req.body?.instructions },
  });
  res.status(202).json({ jobId: job.id });
}

export async function generateSceneVisual(req: Request, res: Response): Promise<void> {
  const scene = await getOwnedScene(req.user!.id, requiredParam(req, "id"));
  const pipelineRunId = randomUUID();
  const job = await enqueueJob({
    projectId: scene.projectId,
    type: "VISUAL_GENERATION",
    payload: { pipelineRunId, sceneId: scene.id },
  });
  res.status(202).json({ jobId: job.id });
}

export async function generateSceneVoice(req: Request, res: Response): Promise<void> {
  const scene = await getOwnedScene(req.user!.id, requiredParam(req, "id"));
  const pipelineRunId = randomUUID();
  const job = await enqueueJob({
    projectId: scene.projectId,
    type: "VOICE_GENERATION",
    payload: { pipelineRunId, sceneId: scene.id },
  });
  res.status(202).json({ jobId: job.id });
}
