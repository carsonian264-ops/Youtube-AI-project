import { Worker, type Job as BullJob } from "bullmq";
import { prisma } from "@/db/prisma";
import { QUEUE_NAMES } from "../queues";
import { redisConnection } from "../connection";
import { jobService } from "@/services/job/JobService";
import { projectService } from "@/services/project/ProjectService";
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

        await jobService.markCompleted(jobId, result);
        await projectService.transitionStatus(projectId, "READY_FOR_REVIEW");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Quality check failed";
        logger.error({ err, projectId, jobId }, "Quality check worker failed");
        await jobService.markFailed(jobId, message, false);
        // Quality check failing should not strand the project -- the
        // user can still review what was generated and decide what to
        // regenerate, per "the user must remain in control."
        await projectService.transitionStatus(projectId, "READY_FOR_REVIEW").catch(() => undefined);
      }
    },
    { connection: redisConnection, concurrency: 4 },
  );
}
