import { randomUUID } from "node:crypto";
import { Worker, type Job as BullJob } from "bullmq";
import { prisma } from "@/db/prisma";
import { QUEUE_NAMES } from "../queues";
import { redisConnection } from "../connection";
import { enqueueJob } from "../enqueue";
import { jobService } from "@/services/job/JobService";
import { projectService } from "@/services/project/ProjectService";
import { createStorageProvider } from "@/services/providers";
import { captionService } from "@/services/caption/CaptionService";
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
        const scenes = await prisma.scene.findMany({ where: { projectId }, orderBy: { sceneNumber: "asc" } });
        const srt = captionService.buildSrt(scenes);

        const storage = createStorageProvider();
        const key = `projects/${projectId}/captions/${randomUUID()}.srt`;
        const uploaded = await storage.upload({ key, data: Buffer.from(srt, "utf-8"), contentType: "text/plain" });

        await prisma.caption.create({
          data: { projectId, format: "SRT", storageKey: uploaded.key, url: uploaded.url },
        });

        await jobService.markCompleted(jobId, { captionKey: uploaded.key });

        await projectService.transitionStatus(projectId, "RENDERING");
        await enqueueJob({ projectId, type: "VIDEO_RENDERING", payload: { pipelineRunId } });
        await enqueueJob({ projectId, type: "THUMBNAIL_GENERATION", payload: { pipelineRunId } });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Caption generation failed";
        logger.error({ err, projectId, jobId }, "Caption generation worker failed");
        await jobService.markFailed(jobId, message, false);
        throw err;
      }
    },
    { connection: redisConnection, concurrency: 4 },
  );
}
