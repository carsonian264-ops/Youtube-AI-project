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
  /**
   * Set by a targeted, user-triggered regeneration of one scene (or a
   * whole project's worth of scenes outside the initial pipeline run) --
   * see scene.controller.ts / project.controller.ts. Each such call gets
   * its own pipelineRunId, so without this flag the fan-in check below
   * would see "1 of 1 done" after that single job and treat it as the
   * *whole* pipeline's assets finishing: forcing the project into
   * AUDIO_GENERATING (an illegal transition, and a hard failure, from
   * READY_FOR_REVIEW/PUBLISHED) and re-queuing voice generation for every
   * scene in the project, not just the one that was regenerated.
   */
  sceneOnly?: boolean;
}

function buildStyleReference(characters: { visualStyle: string | null; colors: unknown; environment: string | null }[]): string {
  if (characters.length === 0) return "";
  const parts = characters.map((c) => {
    const colors = Array.isArray(c.colors) ? (c.colors as string[]).join(", ") : "";
    return [c.visualStyle, colors && `palette: ${colors}`, c.environment].filter(Boolean).join(", ");
  });
  return parts.filter(Boolean).join(" | ");
}

/**
 * Runs once every scene's visual-generation job for this pipeline run has
 * reached a terminal state (COMPLETED or FAILED-with-no-more-retries) --
 * called from both the success path (the job that happens to finish last)
 * and the failure path (a job's *last* retry attempt), since either one
 * could be the one that completes the batch.
 *
 * This second call site matters: if every single scene's image generation
 * permanently fails (e.g. the provider account is out of balance), no job
 * ever reaches the success path, so without also checking here the fan-in
 * would never run at all and the project would sit in ASSETS_GENERATING
 * forever with no visible error -- every individual job shows FAILED, but
 * nothing ever looks at the batch as a whole.
 *
 * If at least one scene got an image, the pipeline still proceeds to
 * voice-generation as before (permissive partial-failure behavior
 * unchanged) -- video-rendering already throws a clear per-scene error for
 * whichever scenes are still missing an image. If *none* got an image,
 * there's nothing worth rendering, so the project is failed outright here
 * instead of wastefully generating narration audio for a video that can
 * never actually render.
 */
async function maybeAdvanceAfterVisualGenerationBatch(projectId: string, pipelineRunId: string, lastErrorMessage: string): Promise<void> {
  const counts = await jobService.countByTypeAndStatus(projectId, "VISUAL_GENERATION", pipelineRunId);
  if (counts.total === 0 || counts.completed + counts.failed !== counts.total) return;

  if (counts.completed === 0) {
    await projectService
      .transitionStatus(projectId, "FAILED", `All ${counts.total} scene image(s) failed to generate: ${lastErrorMessage}`)
      .catch(() => undefined);
    return;
  }

  // Same race as before: multiple scenes' visual-generation jobs run
  // concurrently (worker concurrency: 3), so more than one can finish
  // within milliseconds of each other and all observe "all done" here.
  // The per-scene idempotencyKey below is what collapses those redundant
  // firings down to exactly one VOICE_GENERATION job per scene instead of
  // enqueueing the whole batch N times.
  const scenes = await prisma.scene.findMany({ where: { projectId } });
  await projectService.transitionStatus(projectId, "AUDIO_GENERATING").catch(() => undefined);
  for (const s of scenes) {
    await enqueueJob({
      projectId,
      type: "VOICE_GENERATION",
      payload: { pipelineRunId, sceneId: s.id },
      idempotencyKey: `voice-generation:${pipelineRunId}:${s.id}`,
    });
  }
}

export function startVisualGenerationWorker(): Worker {
  return new Worker<Payload>(
    QUEUE_NAMES.VISUAL_GENERATION,
    async (bullJob: BullJob<Payload>) => {
      const { jobId, projectId, pipelineRunId, sceneId, sceneOnly } = bullJob.data;
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

        if (sceneOnly) return;
        await maybeAdvanceAfterVisualGenerationBatch(projectId, pipelineRunId, "");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Visual generation failed";
        logger.error({ err, projectId, jobId, sceneId }, "Visual generation worker failed");
        const lastAttempt = isLastAttempt(bullJob);
        await jobService.markFailed(jobId, message, !lastAttempt);

        if (lastAttempt && !sceneOnly) {
          await maybeAdvanceAfterVisualGenerationBatch(projectId, pipelineRunId, message);
        }
        throw err;
      }
    },
    { connection: redisConnection, concurrency: 3 },
  );
}
