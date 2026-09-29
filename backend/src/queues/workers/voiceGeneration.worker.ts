import { Worker, type Job as BullJob } from "bullmq";
import { prisma } from "@/db/prisma";
import { QUEUE_NAMES } from "../queues";
import { redisConnection } from "../connection";
import { enqueueJob } from "../enqueue";
import { isLastAttempt } from "../retry";
import { jobService } from "@/services/job/JobService";
import { assetService } from "@/services/asset/AssetService";
import { projectService } from "@/services/project/ProjectService";
import { ProjectStateMachine } from "@/services/project/ProjectStateMachine";
import { createVoiceGenerationProvider } from "@/services/providers";
import { logger } from "@/utils/logger";
import { measureAudioDurationSeconds } from "@/utils/mediaProbe";

interface Payload {
  jobId: string;
  projectId: string;
  pipelineRunId: string;
  sceneId: string;
  /** See the identical flag in visualGeneration.worker.ts -- same fan-in hazard, same fix. */
  sceneOnly?: boolean;
}

/**
 * Same reasoning as visualGeneration.worker.ts's identically-named helper:
 * called from both the success path and a job's last-retry failure path,
 * since either could be the one that completes the batch -- if every
 * scene's narration permanently fails, only the failure-path call would
 * ever notice the batch is done. Voice generation isn't fatal per-scene
 * (FFmpegRenderer falls back to silence for a scene with no audio), so
 * partial failure still proceeds to captions as before; only a *total*
 * failure (not one single scene has narration) fails the project outright
 * instead of producing a completely silent video with no explanation.
 */
async function maybeAdvanceAfterVoiceGenerationBatch(projectId: string, pipelineRunId: string, lastErrorMessage: string): Promise<void> {
  const counts = await jobService.countByTypeAndStatus(projectId, "VOICE_GENERATION", pipelineRunId);
  if (counts.total === 0 || counts.completed + counts.failed !== counts.total) return;

  if (counts.completed === 0) {
    await projectService
      .transitionStatus(projectId, "FAILED", `All ${counts.total} scene narration(s) failed to generate: ${lastErrorMessage}`)
      .catch(() => undefined);
    return;
  }

  // Same reasoning as visual-generation's pre-enqueue guard: don't fan out
  // into caption generation for a project that was cancelled/failed out
  // from under this batch while its voice-generation jobs were still
  // running. There's no single specific "to" status to check here the way
  // visual-generation checks canTransition(..., "AUDIO_GENERATING") --
  // voice generation doesn't itself transition the project -- so this
  // checks isStopped() directly instead (deliberately not isTerminal():
  // FAILED can still legally move on to PLANNING via a user retry, but a
  // project that failed via a different job/path is just as much a reason
  // to stop here as an explicit cancellation).
  const current = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { status: true } });
  if (ProjectStateMachine.isStopped(current.status)) {
    logger.info(
      { projectId, status: current.status },
      "Voice generation batch finished but the project is already cancelled/failed; not enqueueing caption generation",
    );
    return;
  }

  // Same race as visual-generation's fan-in above: multiple scenes' voice
  // jobs can finish within the same instant and all reach this branch.
  // The idempotencyKey ensures only one CAPTION_GENERATION job for this
  // pipeline run is ever created.
  await enqueueJob({
    projectId,
    type: "CAPTION_GENERATION",
    payload: { pipelineRunId },
    idempotencyKey: `caption-generation:${pipelineRunId}`,
  });
}

export function startVoiceGenerationWorker(): Worker {
  return new Worker<Payload>(
    QUEUE_NAMES.VOICE_GENERATION,
    async (bullJob: BullJob<Payload>) => {
      const { jobId, projectId, pipelineRunId, sceneId, sceneOnly } = bullJob.data;
      await jobService.markActive(jobId);

      try {
        const [scene, project] = await Promise.all([
          prisma.scene.findUniqueOrThrow({ where: { id: sceneId } }),
          prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
        ]);

        const voiceProvider = createVoiceGenerationProvider();
        const audio = await voiceProvider.generateSpeech({ text: scene.narration });
        const durationSeconds = await measureAudioDurationSeconds(audio.data);

        await assetService.recordAsset({
          projectId,
          sceneId,
          userId: project.userId,
          type: "AUDIO",
          provider: audio.provider,
          data: audio.data,
          mimeType: audio.mimeType,
          extension: "mp3",
          metadata: { ...audio.metadata, durationSeconds },
        });

        if (durationSeconds > 0) {
          await prisma.scene.update({ where: { id: sceneId }, data: { durationSeconds } });
        }

        await jobService.markCompleted(jobId, { sceneId, durationSeconds });

        if (sceneOnly) return;
        await maybeAdvanceAfterVoiceGenerationBatch(projectId, pipelineRunId, "");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Voice generation failed";
        logger.error({ err, projectId, jobId, sceneId }, "Voice generation worker failed");
        const lastAttempt = isLastAttempt(bullJob);
        await jobService.markFailed(jobId, message, !lastAttempt);

        if (lastAttempt && !sceneOnly) {
          await maybeAdvanceAfterVoiceGenerationBatch(projectId, pipelineRunId, message);
        }
        throw err;
      }
    },
    { connection: redisConnection, concurrency: 3 },
  );
}
