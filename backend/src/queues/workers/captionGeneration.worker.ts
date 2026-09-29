import { randomUUID } from "node:crypto";
import { Worker, type Job as BullJob } from "bullmq";
import { prisma } from "@/db/prisma";
import { QUEUE_NAMES } from "../queues";
import { redisConnection } from "../connection";
import { enqueueJob } from "../enqueue";
import { isLastAttempt } from "../retry";
import { jobService } from "@/services/job/JobService";
import { projectService } from "@/services/project/ProjectService";
import { createStorageProvider } from "@/services/providers";
import { captionService } from "@/services/caption/CaptionService";
import { VIDEO_STYLE_CONFIG } from "@/services/video/videoStyle";
import { RESOLUTION } from "@/services/video/resolution";
import { logger } from "@/utils/logger";

interface Payload {
  jobId: string;
  projectId: string;
  pipelineRunId: string;
}

export function startCaptionGenerationWorker(): Worker {
  return new Worker<Payload>(
    QUEUE_NAMES.CAPTION_GENERATION,
    async (bullJob: BullJob<Payload>) => {
      const { jobId, projectId, pipelineRunId } = bullJob.data;
      await jobService.markActive(jobId);

      try {
        const [project, scenes] = await Promise.all([
          prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
          prisma.scene.findMany({ where: { projectId }, orderBy: { sceneNumber: "asc" } }),
        ]);
        const { width, height } = RESOLUTION[project.aspectRatio];
        const captionStyle = VIDEO_STYLE_CONFIG[project.videoStyle].captionStyle;
        const ass = captionService.buildAss(scenes, captionStyle, width, height);

        const storage = createStorageProvider();
        const key = `projects/${projectId}/captions/${randomUUID()}.ass`;
        const uploaded = await storage.upload({ key, data: Buffer.from(ass, "utf-8"), contentType: "text/plain" });

        await prisma.caption.create({
          data: { projectId, format: "ASS", storageKey: uploaded.key, url: uploaded.url },
        });

        await jobService.markCompleted(jobId, { captionKey: uploaded.key });

        await projectService.transitionStatus(projectId, "RENDERING");
        // Deterministic keys guard against a BullMQ retry of *this* job
        // (e.g. a transient failure right after markCompleted) re-firing
        // duplicate render/thumbnail jobs on the retry attempt.
        await enqueueJob({
          projectId,
          type: "VIDEO_RENDERING",
          payload: { pipelineRunId },
          idempotencyKey: `video-rendering:${pipelineRunId}`,
        });
        await enqueueJob({
          projectId,
          type: "THUMBNAIL_GENERATION",
          payload: { pipelineRunId },
          idempotencyKey: `thumbnail-generation:${pipelineRunId}`,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Caption generation failed";
        logger.error({ err, projectId, jobId }, "Caption generation worker failed");
        const lastAttempt = isLastAttempt(bullJob);
        await jobService.markFailed(jobId, message, !lastAttempt);
        if (lastAttempt) {
          // Unlike thumbnail generation (which never gates the state
          // machine -- see regenerateThumbnails' doc comment), caption
          // generation is a hard prerequisite for video-rendering: nothing
          // else enqueues VIDEO_RENDERING if this job never succeeds. Without
          // this, a permanent failure here would leave the project stuck in
          // RENDERING forever with no visible error.
          await projectService.transitionStatus(projectId, "FAILED", message).catch(() => undefined);
        }
        throw err;
      }
    },
    { connection: redisConnection, concurrency: 4 },
  );
}
