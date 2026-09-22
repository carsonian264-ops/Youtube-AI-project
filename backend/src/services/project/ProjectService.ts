import { prisma } from "@/db/prisma";
import type { AspectRatio, Project, ProjectStatus } from "@/generated/prisma";
import { AuthorizationError, ConflictError, NotFoundError } from "@/utils/errors";
import { ProjectStateMachine } from "./ProjectStateMachine";

export interface CreateProjectInput {
  title: string;
  concept: string;
  targetAudience?: string;
  tone?: string;
  estimatedDurationSeconds?: number;
  aspectRatio?: AspectRatio;
}

export interface UpdateProjectInput {
  title?: string;
  targetAudience?: string;
  tone?: string;
  aspectRatio?: AspectRatio;
}

/**
 * Owns Project CRUD and enforces the single most important security
 * invariant in the app: a user may only ever read or mutate their own
 * projects. getOwned() is the one function every controller/worker
 * should call to load a project -- it throws NotFoundError for a
 * genuinely missing project and AuthorizationError for "exists, but not
 * yours" so that ID-guessing cannot be used to distinguish the two.
 */
export class ProjectService {
  async create(userId: string, input: CreateProjectInput): Promise<Project> {
    return prisma.project.create({
      data: {
        userId,
        title: input.title,
        concept: input.concept,
        targetAudience: input.targetAudience,
        tone: input.tone,
        estimatedDurationSeconds: input.estimatedDurationSeconds,
        aspectRatio: input.aspectRatio ?? "LANDSCAPE_16_9",
        status: "DRAFT",
      },
    });
  }

  async list(userId: string): Promise<Project[]> {
    return prisma.project.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
  }

  async getOwned(userId: string, projectId: string): Promise<Project> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundError("Project");
    }
    if (project.userId !== userId) {
      throw new AuthorizationError();
    }
    return project;
  }

  async update(userId: string, projectId: string, input: UpdateProjectInput): Promise<Project> {
    await this.getOwned(userId, projectId);
    return prisma.project.update({ where: { id: projectId }, data: input });
  }

  async delete(userId: string, projectId: string): Promise<void> {
    const project = await this.getOwned(userId, projectId);
    if (project.status === "PUBLISHING") {
      // Every related row (Job, PublishingJob, ...) cascade-deletes with
      // the project, but the real YouTube upload a worker is mid-flight
      // on has no way to know that -- it would keep running against
      // rows that no longer exist, and the video would end up
      // successfully published with the app having no record of it.
      // Same reasoning as cancel() refusing to touch a live publish.
      throw new ConflictError("Cannot delete a project while it is actively publishing to YouTube; wait for it to finish");
    }
    await prisma.project.delete({ where: { id: projectId } });
  }

  async transitionStatus(projectId: string, to: ProjectStatus, failureReason?: string): Promise<Project> {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    ProjectStateMachine.assertTransition(project.status, to);
    return prisma.project.update({
      where: { id: projectId },
      data: { status: to, failureReason: to === "FAILED" ? failureReason : null },
    });
  }

  /**
   * Compare-and-swap transition: only actually moves the project's status
   * (and only returns true) if it is still in one of `expectedFrom` at the
   * moment the UPDATE runs. Every route that kicks off a background stage
   * -- generate/render/quality-check/publish -- reads the current status,
   * decides it's legal to proceed, *then* does work; two requests racing
   * through that same read-then-act window would otherwise both pass the
   * check and both enqueue a duplicate job (or, for publishing, upload
   * the same video to YouTube twice). Postgres serializes concurrent
   * UPDATEs to the same row, so of two racing calls only one can match
   * the WHERE clause and actually flip the status -- the loser's
   * `updateMany` affects zero rows, and callers use that signal to skip
   * their side effects instead of performing them a second time.
   */
  async transitionStatusIfCurrent(projectId: string, expectedFrom: ProjectStatus[], to: ProjectStatus): Promise<boolean> {
    for (const from of expectedFrom) {
      ProjectStateMachine.assertTransition(from, to);
    }
    const result = await prisma.project.updateMany({
      where: { id: projectId, status: { in: expectedFrom } },
      data: { status: to, failureReason: null },
    });
    return result.count === 1;
  }

  async getFullWorkspace(userId: string, projectId: string) {
    const project = await this.getOwned(userId, projectId);
    const [scripts, scenes, characters, assets, jobs, videos, thumbnails] = await Promise.all([
      prisma.script.findMany({ where: { projectId }, orderBy: { versionNumber: "desc" } }),
      prisma.scene.findMany({ where: { projectId }, orderBy: { sceneNumber: "asc" } }),
      prisma.character.findMany({ where: { projectId } }),
      prisma.asset.findMany({ where: { projectId } }),
      prisma.job.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } }),
      prisma.video.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } }),
      prisma.thumbnail.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } }),
    ]);
    return { project, scripts, scenes, characters, assets, jobs, videos, thumbnails };
  }
}

export const projectService = new ProjectService();
