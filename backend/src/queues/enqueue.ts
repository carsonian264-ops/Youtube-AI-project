import { prisma } from "@/db/prisma";
import type { JobType } from "@/generated/prisma";
import { jobService } from "@/services/job/JobService";
import { logger } from "@/utils/logger";
import { JOB_TYPE_TO_QUEUE_NAME, queues } from "./queues";

export interface EnqueueInput {
  projectId: string;
  type: JobType;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}

/**
 * The one function that creates a durable Job row AND schedules the
 * corresponding BullMQ job, using the same id for both so a worker can
 * always look up full job state/history in Postgres from the BullMQ job
 * id it was handed. Every route/worker that starts background work goes
 * through this instead of touching `queues` directly.
 */
export async function enqueueJob(input: EnqueueInput) {
  const job = await jobService.create({
    projectId: input.projectId,
    type: input.type,
    payload: input.payload,
    idempotencyKey: input.idempotencyKey,
  });

  const queueName = JOB_TYPE_TO_QUEUE_NAME[input.type];
  const bullJob = await queues[queueName].add(
    input.type,
    { jobId: job.id, projectId: input.projectId, ...input.payload },
    { jobId: job.id },
  );

  if (bullJob.id) {
    await jobService.setQueueJobId(job.id, bullJob.id);
  }

  return job;
}

/**
 * Best-effort cancellation for a project: removes every not-yet-started
 * (still queued, not currently being processed) BullMQ job belonging to
 * it and marks their Postgres rows CANCELLED. A job that's already
 * ACTIVE is left running -- there's no safe way to interrupt an
 * in-flight FFmpeg render or an in-flight Claude/YouTube call mid-call,
 * so "cancellation where practical" (spec section 12) means the queue
 * backlog, not forcibly killing live work.
 */
export async function cancelPendingJobsForProject(projectId: string): Promise<void> {
  const pendingJobs = await prisma.job.findMany({
    where: { projectId, status: "PENDING" },
  });

  for (const job of pendingJobs) {
    try {
      const queueName = JOB_TYPE_TO_QUEUE_NAME[job.type];
      const bullJob = await queues[queueName].getJob(job.queueJobId ?? job.id);
      if (bullJob) {
        const state = await bullJob.getState();
        if (state === "waiting" || state === "delayed" || state === "prioritized") {
          await bullJob.remove();
        } else {
          // Already active, or already finished and cleaned out of
          // Redis by the time we got here (BullMQ can remove a
          // completed/failed job before we ever see it, especially for
          // a near-instant mock-provider job) -- leave its Postgres
          // status exactly as whatever the worker itself last wrote.
          continue;
        }
      }
      // Guarded on status still being PENDING: between the findMany()
      // above and here, the worker may have already picked this job up
      // and moved it to ACTIVE/COMPLETED/FAILED. An unconditional
      // update would clobber that -- e.g. overwrite a job that actually
      // *succeeded* back to CANCELLED, which would then make
      // countByTypeAndStatus() under-count completed jobs and stall the
      // "are all siblings done" cascade checks elsewhere.
      await prisma.job.updateMany({
        where: { id: job.id, status: "PENDING" },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
    } catch (err) {
      logger.warn({ err, jobId: job.id, projectId }, "Failed to cancel a pending job; leaving it as-is");
    }
  }
}
