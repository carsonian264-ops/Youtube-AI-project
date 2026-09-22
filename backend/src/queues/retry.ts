import type { Job } from "bullmq";

/**
 * Whether the current execution of `job` is the last one BullMQ will make
 * before giving up (mirrors BullMQ's own retry decision in
 * Job.shouldRetryJob: `attemptsMade + 1 < opts.attempts`). Workers must
 * check this from inside their catch block *before* deciding to move the
 * owning project to a terminal FAILED-style status -- a transient error on
 * attempt 1 of 3 is about to be retried automatically, and flipping the
 * project to FAILED that early would make a *successful* retry's own
 * success-path status transition illegal (FAILED only ever leads back to
 * PLANNING/CANCELLED in ProjectStateMachine), permanently wedging a
 * pipeline that a plain automatic retry would otherwise have recovered.
 */
export function isLastAttempt(job: Job): boolean {
  const maxAttempts = job.opts.attempts ?? 1;
  return job.attemptsMade + 1 >= maxAttempts;
}
