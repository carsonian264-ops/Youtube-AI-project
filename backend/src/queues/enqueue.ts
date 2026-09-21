import type { JobType } from "@/generated/prisma";
import { jobService } from "@/services/job/JobService";
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
