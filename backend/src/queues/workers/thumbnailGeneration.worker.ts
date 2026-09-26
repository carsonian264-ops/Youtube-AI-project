import { randomUUID } from "node:crypto";
import { Worker, type Job as BullJob } from "bullmq";
import { prisma } from "@/db/prisma";
import { QUEUE_NAMES } from "../queues";
import { redisConnection } from "../connection";
import { isLastAttempt } from "../retry";
import { jobService } from "@/services/job/JobService";
import { createStorageProvider, createVisualGenerationProvider } from "@/services/providers";
import { usageService } from "@/services/usage/UsageService";
import { logger } from "@/utils/logger";

interface Payload {
  jobId: string;
  projectId: string;
  pipelineRunId: string;
}

// Thumbnails matter a lot for click-through, and a single AI guess rarely
// nails it -- generating a few visually distinct candidates and letting
// the user pick beats forcing them to accept (or manually regenerate)
// whichever one the model happened to produce first.
const STYLE_VARIANTS = [
  "clean composition, primary subject centered, bold readable focal point",
  "dynamic close-up angle, dramatic lighting, high emotional impact",
  "wide establishing shot, bright saturated colors, curiosity-driven composition",
];

export function startThumbnailGenerationWorker(): Worker {
  return new Worker<Payload>(
    QUEUE_NAMES.THUMBNAIL_GENERATION,
    async (bullJob: BullJob<Payload>) => {
      const { jobId, projectId } = bullJob.data;
      await jobService.markActive(jobId);

      try {
        const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
        const visualProvider = createVisualGenerationProvider();
        const storage = createStorageProvider();
        const existingCount = await prisma.thumbnail.count({ where: { projectId } });

        const basePrompt = `Bold, high-contrast YouTube thumbnail for a video titled "${project.title}" about: ${project.concept}. Eye-catching but not misleading, minimal text.`;
        const thumbnailKeys: string[] = [];

        for (const [index, styleVariant] of STYLE_VARIANTS.entries()) {
          const media = await visualProvider.generateImage({
            prompt: `${basePrompt} Style: ${styleVariant}.`,
            aspectRatio: "LANDSCAPE_16_9",
          });

          const key = `projects/${projectId}/thumbnails/${randomUUID()}.png`;
          const uploaded = await storage.upload({ key, data: media.data, contentType: media.mimeType });
          thumbnailKeys.push(uploaded.key);

          await prisma.thumbnail.create({
            data: {
              projectId,
              storageKey: uploaded.key,
              url: uploaded.url,
              isSelected: existingCount === 0 && index === 0,
            },
          });

          await usageService.record({
            userId: project.userId,
            projectId,
            type: "IMAGE_GENERATION",
            quantity: 1,
            unit: "generation",
            metadata: { kind: "thumbnail", provider: media.provider, variant: styleVariant },
          });
        }

        await jobService.markCompleted(jobId, { thumbnailKeys });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Thumbnail generation failed";
        logger.error({ err, projectId, jobId }, "Thumbnail generation worker failed");
        await jobService.markFailed(jobId, message, !isLastAttempt(bullJob));
        throw err;
      }
    },
    { connection: redisConnection, concurrency: 3 },
  );
}
