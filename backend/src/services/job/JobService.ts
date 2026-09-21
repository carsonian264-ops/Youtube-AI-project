import { prisma } from "@/db/prisma";
import type { Job, JobStatus, JobType, Prisma } from "@/generated/prisma";
import { NotFoundError } from "@/utils/errors";

export interface CreateJobInput {
  projectId: string;
  type: JobType;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}

/**
 * Persistence layer for background jobs, kept separate from the BullMQ
 * queue wiring (queues/queues.ts) so job *state* (status, progress,
 * retries, error) lives durably in Postgres even though the *execution*
 * is driven by Redis-backed queues. This is what lets the frontend poll
 * GET /api/jobs/:id (or a project's job list) for progress without
 * talking to Redis directly, and is what makes a failed render resumable
 * instead of restarting the whole project.
 */
export class JobService {
  async create(input: CreateJobInput): Promise<Job> {
    if (input.idempotencyKey) {
      const existing = await prisma.job.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return existing;
    }
    return prisma.job.create({
      data: {
        projectId: input.projectId,
        type: input.type,
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
        idempotencyKey: input.idempotencyKey,
        status: "PENDING",
      },
    });
  }

  async get(jobId: string): Promise<Job> {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundError("Job");
    return job;
  }

  async listForProject(projectId: string): Promise<Job[]> {
    return prisma.job.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  }

  async setQueueJobId(jobId: string, queueJobId: string): Promise<void> {
    await prisma.job.update({ where: { id: jobId }, data: { queueJobId } });
  }

  async markActive(jobId: string): Promise<void> {
    const job = await prisma.job.update({
      where: { id: jobId },
      data: { status: "ACTIVE", startedAt: new Date(), progress: 0 },
    });
    await prisma.jobAttempt.create({
      data: { jobId: job.id, attemptNumber: job.retryCount + 1, status: "ACTIVE" },
    });
  }

  async updateProgress(jobId: string, progress: number): Promise<void> {
    await prisma.job.update({ where: { id: jobId }, data: { progress: Math.max(0, Math.min(100, progress)) } });
  }

  async markCompleted(jobId: string, result?: Record<string, unknown>): Promise<void> {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "COMPLETED", progress: 100, result: (result ?? {}) as Prisma.InputJsonValue, completedAt: new Date() },
    });
    await this.closeLatestAttempt(jobId, "COMPLETED");
  }

  async markFailed(jobId: string, errorMessage: string, willRetry: boolean): Promise<void> {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: willRetry ? "PENDING" : "FAILED",
        errorMessage,
        retryCount: { increment: 1 },
        completedAt: willRetry ? null : new Date(),
      },
    });
    await this.closeLatestAttempt(jobId, "FAILED", errorMessage);
  }

  private async closeLatestAttempt(jobId: string, status: JobStatus, errorMessage?: string): Promise<void> {
    const latest = await prisma.jobAttempt.findFirst({ where: { jobId }, orderBy: { attemptNumber: "desc" } });
    if (!latest) return;
    await prisma.jobAttempt.update({
      where: { id: latest.id },
      data: { status, errorMessage, completedAt: new Date() },
    });
  }

  async countByTypeAndStatus(projectId: string, type: JobType, pipelineRunId: string) {
    const jobs = await prisma.job.findMany({
      where: { projectId, type },
    });
    const forRun = jobs.filter((j) => (j.payload as Record<string, unknown>)?.pipelineRunId === pipelineRunId);
    return {
      total: forRun.length,
      completed: forRun.filter((j) => j.status === "COMPLETED").length,
      failed: forRun.filter((j) => j.status === "FAILED").length,
    };
  }
}

export const jobService = new JobService();
