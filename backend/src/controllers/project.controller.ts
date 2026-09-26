import { requiredParam } from "@/utils/params";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { prisma } from "@/db/prisma";
import { projectService } from "@/services/project/ProjectService";
import { cancelPendingJobsForProject, enqueueJob } from "@/queues/enqueue";
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

  // Compare-and-swap, not read-then-write: two requests racing here
  // (a double-click, or a retried request) must not both pass a plain
  // status check and each enqueue their own CONTENT_GENERATION job.
  const claimed = await projectService.transitionStatusIfCurrent(project.id, ["DRAFT", "FAILED"], "PLANNING");
  if (!claimed) {
    throw new ConflictError("Project is already generating or has already been generated; cancel or wait for it to finish before regenerating everything");
  }

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
  const claimed = await projectService.transitionStatusIfCurrent(project.id, ["SCRIPT_READY"], "SCRIPT_GENERATING");
  if (!claimed) {
    throw new ConflictError("Project must be in SCRIPT_READY to regenerate the script (it may already be regenerating)");
  }

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

  const claimed = await projectService.transitionStatusIfCurrent(
    project.id,
    ["AUDIO_GENERATING", "QUALITY_CHECK", "READY_FOR_REVIEW"],
    "RENDERING",
  );
  if (!claimed) {
    throw new ConflictError("Project is not in a state that can be rendered right now (it may already be rendering)");
  }
  const pipelineRunId = randomUUID();
  const job = await enqueueJob({ projectId: project.id, type: "VIDEO_RENDERING", payload: { pipelineRunId } });
  res.status(202).json({ jobId: job.id, pipelineRunId });
}

export async function runQualityCheck(req: Request, res: Response): Promise<void> {
  const project = await projectService.getOwned(req.user!.id, requiredParam(req, "id"));
  // The automatic pipeline enqueues this itself after rendering (project
  // status is already QUALITY_CHECK by the time that job runs). A
  // user-triggered re-check only makes sense once the project has
  // actually reached review -- earlier than that, scenes/assets aren't
  // final yet, and the worker's own success path expects to land back
  // on READY_FOR_REVIEW, which isn't a legal transition from any earlier
  // state (see ProjectStateMachine).
  if (project.status !== "READY_FOR_REVIEW" && project.status !== "QUALITY_CHECK") {
    throw new ConflictError(
      `Quality check can only be run once a project reaches READY_FOR_REVIEW (currently ${project.status})`,
    );
  }
  const job = await enqueueJob({ projectId: project.id, type: "QUALITY_CHECK", payload: {} });
  res.status(202).json({ jobId: job.id });
}

/**
 * Cancels a project: transitions it to CANCELLED (rejected with 409 if
 * it's already in a terminal state or -- deliberately -- actively
 * PUBLISHING, since there's no safe way to retroactively "cancel" a
 * YouTube upload that's already in flight) and removes every
 * not-yet-started queued job so it doesn't keep churning in the
 * background.
 */
export async function cancelProject(req: Request, res: Response): Promise<void> {
  const project = await projectService.getOwned(req.user!.id, requiredParam(req, "id"));
  const updated = await projectService.transitionStatus(project.id, "CANCELLED");
  await cancelPendingJobsForProject(project.id);
  res.status(200).json(updated);
}

export async function selectThumbnail(req: Request, res: Response): Promise<void> {
  await projectService.selectThumbnail(req.user!.id, requiredParam(req, "id"), requiredParam(req, "thumbnailId"));
  res.status(204).send();
}
