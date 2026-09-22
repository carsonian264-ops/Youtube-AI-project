import { Worker, type Job as BullJob } from "bullmq";
import { prisma } from "@/db/prisma";
import { QUEUE_NAMES } from "../queues";
import { redisConnection } from "../connection";
import { enqueueJob } from "../enqueue";
import { isLastAttempt } from "../retry";
import { jobService } from "@/services/job/JobService";
import { assetService } from "@/services/asset/AssetService";
import { projectService } from "@/services/project/ProjectService";
import { createVisualGenerationProvider } from "@/services/providers";
import { logger } from "@/utils/logger";

interface Payload {
  jobId: string;
  projectId: string;
  pipelineRunId: string;
  sceneId: string;
}

function buildStyleReference(characters: { visualStyle: string | null; colors: unknown; environment: string | null }[]): string {
  if (characters.length === 0) return "";
  const parts = characters.map((c) => {
    const colors = Array.isArray(c.colors) ? (c.colors as string[]).join(", ") : "";
    return [c.visualStyle, colors && `palette: ${colors}`, c.environment].filter(Boolean).join(", ");
  });
  return parts.filter(Boolean).join(" | ");
}

export function startVisualGenerationWorker(): Worker {
  return new Worker<Payload>(
    QUEUE_NAMES.VISUAL_GENERATION,
    async (bullJob: BullJob<Payload>) => {
      const { jobId, projectId, pipelineRunId, sceneId } = bullJob.data;
      await jobService.markActive(jobId);

      try {
        const [scene, project, characters] = await Promise.all([
          prisma.scene.findUniqueOrThrow({ where: { id: sceneId } }),
          prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
          prisma.character.findMany({ where: { projectId } }),
        ]);

        const visualProvider = createVisualGenerationProvider();
        const media = await visualProvider.generateImage({
          prompt: scene.visualPrompt,
          aspectRatio: project.aspectRatio,
          styleReference: buildStyleReference(characters),
        });

        await assetService.recordAsset({
          projectId,
          sceneId,
          userId: project.userId,
          type: "IMAGE",
          provider: media.provider,
          data: media.data,
          mimeType: media.mimeType,
          extension: "png",
          metadata: media.metadata,
        });

        await prisma.scene.update({ where: { id: sceneId }, data: { status: "READY" } });
        await jobService.markCompleted(jobId, { sceneId });

        const counts = await jobService.countByTypeAndStatus(projectId, "VISUAL_GENERATION", pipelineRunId);
        if (counts.total > 0 && counts.completed + counts.failed === counts.total) {
          // Every scene's visual-generation job runs concurrently
          // (worker concurrency: 3), so the last two or three can finish
          // within milliseconds of each other and *all* observe "all
          // done" here -- this branch runs once per scene that happens
          // to be the last one to complete, not once per project. The
          // per-scene idempotencyKey below is what collapses those
          // redundant firings down to exactly one VOICE_GENERATION job
          // per scene instead of enqueueing the whole batch N times.
          const scenes = await prisma.scene.findMany({ where: { projectId } });
          await projectService.transitionStatus(projectId, "AUDIO_GENERATING");
          for (const s of scenes) {
            await enqueueJob({
              projectId,
              type: "VOICE_GENERATION",
              payload: { pipelineRunId, sceneId: s.id },
              idempotencyKey: `voice-generation:${pipelineRunId}:${s.id}`,
            });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Visual generation failed";
        logger.error({ err, projectId, jobId, sceneId }, "Visual generation worker failed");
        await jobService.markFailed(jobId, message, !isLastAttempt(bullJob));
        throw err;
      }
    },
    { connection: redisConnection, concurrency: 3 },
  );
}
