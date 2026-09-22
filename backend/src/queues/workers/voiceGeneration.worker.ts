import { Worker, type Job as BullJob } from "bullmq";
import { prisma } from "@/db/prisma";
import { QUEUE_NAMES } from "../queues";
import { redisConnection } from "../connection";
import { enqueueJob } from "../enqueue";
import { isLastAttempt } from "../retry";
import { jobService } from "@/services/job/JobService";
import { assetService } from "@/services/asset/AssetService";
import { createVoiceGenerationProvider } from "@/services/providers";
import { logger } from "@/utils/logger";

interface Payload {
  jobId: string;
  projectId: string;
  pipelineRunId: string;
  sceneId: string;
}

export function startVoiceGenerationWorker(): Worker {
  return new Worker<Payload>(
    QUEUE_NAMES.VOICE_GENERATION,
    async (bullJob: BullJob<Payload>) => {
      const { jobId, projectId, pipelineRunId, sceneId } = bullJob.data;
      await jobService.markActive(jobId);

      try {
        const [scene, project] = await Promise.all([
          prisma.scene.findUniqueOrThrow({ where: { id: sceneId } }),
          prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
        ]);

        const voiceProvider = createVoiceGenerationProvider();
        const audio = await voiceProvider.generateSpeech({ text: scene.narration });

        await assetService.recordAsset({
          projectId,
          sceneId,
          userId: project.userId,
          type: "AUDIO",
          provider: audio.provider,
          data: audio.data,
          mimeType: audio.mimeType,
          extension: "mp3",
          metadata: { ...audio.metadata, durationSeconds: audio.durationSeconds },
        });

        if (audio.durationSeconds && audio.durationSeconds > scene.durationSeconds) {
          await prisma.scene.update({ where: { id: sceneId }, data: { durationSeconds: audio.durationSeconds } });
        }

        await jobService.markCompleted(jobId, { sceneId, durationSeconds: audio.durationSeconds });

        const counts = await jobService.countByTypeAndStatus(projectId, "VOICE_GENERATION", pipelineRunId);
        if (counts.total > 0 && counts.completed + counts.failed === counts.total) {
          // Same race as visual-generation's fan-in above: multiple
          // scenes' voice jobs can finish within the same instant and
          // all reach this branch. The idempotencyKey ensures only one
          // CAPTION_GENERATION job for this pipeline run is ever created.
          await enqueueJob({
            projectId,
            type: "CAPTION_GENERATION",
            payload: { pipelineRunId },
            idempotencyKey: `caption-generation:${pipelineRunId}`,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Voice generation failed";
        logger.error({ err, projectId, jobId, sceneId }, "Voice generation worker failed");
        await jobService.markFailed(jobId, message, !isLastAttempt(bullJob));
        throw err;
      }
    },
    { connection: redisConnection, concurrency: 3 },
  );
}
