import { randomUUID } from "node:crypto";
import { Worker, type Job as BullJob } from "bullmq";
import { prisma } from "@/db/prisma";
import { QUEUE_NAMES } from "../queues";
import { redisConnection } from "../connection";
import { jobService } from "@/services/job/JobService";
import { createStorageProvider, createVisualGenerationProvider } from "@/services/providers";
import { usageService } from "@/services/usage/UsageService";
import { logger } from "@/utils/logger";

interface Payload {
  jobId: string;
  projectId: string;
  pipelineRunId: string;
}

export function startThumbnailGenerationWorker(): Worker {
  return new Worker<Payload>(
    QUEUE_NAMES.THUMBNAIL_GENERATION,
    async (bullJob: BullJob<Payload>) => {
      const { jobId, projectId } = bullJob.data;
      await jobService.markActive(jobId);

      try {
        const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
        const visualProvider = createVisualGenerationProvider();

        const media = await visualProvider.generateImage({
          prompt: `Bold, high-contrast YouTube thumbnail for a video titled "${project.title}" about: ${project.concept}. Eye-catching but not misleading, minimal text.`,
          aspectRatio: "LANDSCAPE_16_9",
        });

        const storage = createStorageProvider();
        const key = `projects/${projectId}/thumbnails/${randomUUID()}.png`;
        const uploaded = await storage.upload({ key, data: media.data, contentType: media.mimeType });

        const existingCount = await prisma.thumbnail.count({ where: { projectId } });
        await prisma.thumbnail.create({
          data: { projectId, storageKey: uploaded.key, url: uploaded.url, isSelected: existingCount === 0 },
        });

        await usageService.record({
          userId: project.userId,
          projectId,
          type: "IMAGE_GENERATION",
          quantity: 1,
          unit: "generation",
          metadata: { kind: "thumbnail", provider: media.provider },
        });

        await jobService.markCompleted(jobId, { thumbnailKey: uploaded.key });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Thumbnail generation failed";
        logger.error({ err, projectId, jobId }, "Thumbnail generation worker failed");
        await jobService.markFailed(jobId, message, false);
        throw err;
      }
    },
    { connection: redisConnection, concurrency: 3 },
  );
}
