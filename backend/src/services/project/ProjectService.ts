import { prisma } from "@/db/prisma";
import type { AspectRatio, Project, ProjectStatus } from "@/generated/prisma";
import { AuthorizationError, NotFoundError } from "@/utils/errors";
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
    await this.getOwned(userId, projectId);
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
