import { requiredParam } from "@/utils/params";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { prisma } from "@/db/prisma";
import { projectService } from "@/services/project/ProjectService";
import { enqueueJob } from "@/queues/enqueue";
import { jobService } from "@/services/job/JobService";
import { ConflictError } from "@/utils/errors";

export async function createProject(req: Request, res: Response): Promise<void> {
  const project = await projectService.create(req.user!.id, req.body);
  res.status(201).json(project);
}

export async function listProjects(req: Request, res: Response): Promise<void> {
  const projects = await projectService.list(req.user!.id);
  res.status(200).json(projects);
}

export async function getProject(req: Request, res: Response): Promise<void> {
  const workspace = await projectService.getFullWorkspace(req.user!.id, requiredParam(req, "id"));
  res.status(200).json(workspace);
}

export async function updateProject(req: Request, res: Response): Promise<void> {
  const project = await projectService.update(req.user!.id, requiredParam(req, "id"), req.body);
  res.status(200).json(project);
}

export async function deleteProject(req: Request, res: Response): Promise<void> {
  await projectService.delete(req.user!.id, requiredParam(req, "id"));
  res.status(204).send();
}

export async function generateProject(req: Request, res: Response): Promise<void> {
  const project = await projectService.getOwned(req.user!.id, requiredParam(req, "id"));

  if (project.status !== "DRAFT" && project.status !== "FAILED") {
    throw new ConflictError(`Project is already ${project.status}; cancel or wait for it to finish before regenerating everything`);
  }

  await projectService.transitionStatus(project.id, "PLANNING");

  const pipelineRunId = randomUUID();
  const job = await enqueueJob({
    projectId: project.id,
    type: "CONTENT_GENERATION",
    payload: {
      pipelineRunId,
      idea: project.concept,
      targetDurationSeconds: project.estimatedDurationSeconds ?? undefined,
      tone: project.tone ?? req.body?.tone,
    },
  });

  res.status(202).json({ jobId: job.id, pipelineRunId, status: "PLANNING" });
}

export async function getProjectStatus(req: Request, res: Response): Promise<void> {
  const project = await projectService.getOwned(req.user!.id, requiredParam(req, "id"));
  const jobs = await jobService.listForProject(project.id);
  res.status(200).json({
    projectStatus: project.status,
    failureReason: project.failureReason,
    jobs: jobs.map((j) => ({
      id: j.id,
      type: j.type,
      status: j.status,
      progress: j.progress,
      errorMessage: j.errorMessage,
      retryCount: j.retryCount,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
    })),
  });
}

export async function regenerateScript(req: Request, res: Response): Promise<void> {
  const project = await projectService.getOwned(req.user!.id, requiredParam(req, "id"));
  await projectService.transitionStatus(project.id, "SCRIPT_GENERATING");

  const pipelineRunId = randomUUID();
  const job = await enqueueJob({
    projectId: project.id,
    type: "CONTENT_GENERATION",
    payload: {
      pipelineRunId,
      idea: project.concept,
      targetDurationSeconds: project.estimatedDurationSeconds ?? undefined,
      tone: req.body?.tone ?? project.tone,
    },
  });

  res.status(202).json({ jobId: job.id, pipelineRunId });
}

export async function renderProject(req: Request, res: Response): Promise<void> {
  const project = await projectService.getOwned(req.user!.id, requiredParam(req, "id"));
  const sceneCount = await prisma.scene.count({ where: { projectId: project.id } });
  if (sceneCount === 0) {
    throw new ConflictError("Project has no scenes to render yet");
  }

  await projectService.transitionStatus(project.id, "RENDERING");
  const pipelineRunId = randomUUID();
  const job = await enqueueJob({ projectId: project.id, type: "VIDEO_RENDERING", payload: { pipelineRunId } });
  res.status(202).json({ jobId: job.id, pipelineRunId });
}

export async function runQualityCheck(req: Request, res: Response): Promise<void> {
  const project = await projectService.getOwned(req.user!.id, requiredParam(req, "id"));
  const job = await enqueueJob({ projectId: project.id, type: "QUALITY_CHECK", payload: {} });
  res.status(202).json({ jobId: job.id });
}
