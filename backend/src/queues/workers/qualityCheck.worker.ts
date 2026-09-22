import { Worker, type Job as BullJob } from "bullmq";
import { prisma } from "@/db/prisma";
import { QUEUE_NAMES } from "../queues";
import { redisConnection } from "../connection";
import { isLastAttempt } from "../retry";
import { jobService } from "@/services/job/JobService";
import { projectService } from "@/services/project/ProjectService";
import { ProjectStateMachine } from "@/services/project/ProjectStateMachine";
import { createAIContentProvider } from "@/services/providers";
import type { ProjectPlan } from "@/services/ai/schemas";
import { logger } from "@/utils/logger";

interface Payload {
  jobId: string;
  projectId: string;
}

export function startQualityCheckWorker(): Worker {
  return new Worker<Payload>(
    QUEUE_NAMES.QUALITY_CHECK,
    async (bullJob: BullJob<Payload>) => {
      const { jobId, projectId } = bullJob.data;
      await jobService.markActive(jobId);

      try {
        const [project, script, characters] = await Promise.all([
          prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
          prisma.script.findFirst({ where: { projectId, isActive: true } }),
          prisma.character.findMany({ where: { projectId } }),
        ]);

        if (!script) {
          throw new Error(`Project ${projectId} has no active script to quality-check`);
        }

        const ai = createAIContentProvider({ userId: project.userId, projectId, jobId });
        const plan = script.content as unknown as ProjectPlan;
        const result = await ai.runQualityCheck({
          plan,
          characterBible: {
            characters: characters.map((c) => ({
              name: c.name,
              appearance: c.appearance,
              clothing: c.clothing ?? "",
              personality: c.personality ?? "",
              ageCategory: c.ageCategory ?? "",
              colors: (c.colors as string[]) ?? [],
              visualStyle: c.visualStyle ?? "",
              environment: c.environment ?? "",
              recurringObjects: (c.recurringObjects as string[]) ?? [],
            })),
          },
        });

        // The AI call already succeeded at this point -- mark the job
        // completed unconditionally. Whether we can *also* land the
        // project on READY_FOR_REVIEW depends on its status right now,
        // which can have moved on since this job was enqueued (e.g. the
        // user started a re-render in the meantime); that's a separate
        // concern and must never retroactively turn a successful AI
        // call into a "failed" job.
        await jobService.markCompleted(jobId, result);
        const current = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
        if (ProjectStateMachine.canTransition(current.status, "READY_FOR_REVIEW")) {
          await projectService.transitionStatus(projectId, "READY_FOR_REVIEW");
        } else {
          logger.info(
            { projectId, jobId, status: current.status },
            "Quality check completed but project has since moved to a status that can't transition to READY_FOR_REVIEW; leaving status as-is",
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Quality check failed";
        logger.error({ err, projectId, jobId }, "Quality check worker failed");
        const lastAttempt = isLastAttempt(bullJob);
        await jobService.markFailed(jobId, message, !lastAttempt);
        // Quality check failing should not strand the project -- the
        // user can still review what was generated and decide what to
        // regenerate, per "the user must remain in control." Only do
        // this if the project is actually still sitting in QUALITY_CHECK
        // (the automatic pipeline's own state) -- a manually-triggered
        // re-check failing shouldn't yank the project back to review from
        // wherever else it might legitimately be by now. And only revert
        // once this is genuinely the last attempt -- otherwise BullMQ is
        // about to retry automatically, and reverting now would just
        // cause the eventual (likely successful) retry's own success
        // path to redundantly self-transition, while briefly showing the
        // user a misleading "reverted" state for a failure that never
        // actually stuck.
        if (lastAttempt) {
          await projectService.transitionStatusIfCurrent(projectId, ["QUALITY_CHECK"], "READY_FOR_REVIEW").catch(() => undefined);
        }
      }
    },
    { connection: redisConnection, concurrency: 4 },
  );
}
