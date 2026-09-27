import { randomUUID } from "node:crypto";
import { Worker, type Job as BullJob } from "bullmq";
import { prisma } from "@/db/prisma";
import { QUEUE_NAMES } from "../queues";
import { redisConnection } from "../connection";
import { isLastAttempt } from "../retry";
import { jobService } from "@/services/job/JobService";
import { createStorageProvider, createVisualGenerationProvider } from "@/services/providers";
import { addTitleOverlay } from "@/services/visual/titleOverlay";
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
  "extreme close-up on the main subject's exaggerated shocked or excited facial expression, blurred dramatic background",
  "two or more subjects reacting dramatically toward each other, cinematic lighting, high emotional tension",
  "dynamic action pose with a bold graphic accent (arrow, circle, or glow) drawing the eye to the key detail",
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

        // Aims at the viral-clickbait movie-poster look (think Nollywood
        // thumbnails): a real photorealistic scene with exaggerated
        // reactions and oversaturated contrast. Explicitly asking the
        // diffusion model to also draw the title as text in-image (an
        // earlier version of this prompt did) backfired badly: instead of
        // a photo with lettering on it, models tend to degrade into a flat
        // title card -- solid color background, no scene at all -- because
        // "render this text" dominates the whole composition. Title text is
        // composited on afterward instead (see addTitleOverlay below),
        // which also guarantees it's actually legible.
        const basePrompt = `Viral, high-click-through-rate YouTube thumbnail for a video about: ${project.concept}. Photorealistic photo, oversaturated high-contrast colors, professional movie-poster composition, no text or lettering in the image.`;
        const thumbnailKeys: string[] = [];

        for (const [index, styleVariant] of STYLE_VARIANTS.entries()) {
          const media = await visualProvider.generateImage({
            prompt: `${basePrompt} Style: ${styleVariant}.`,
            aspectRatio: "LANDSCAPE_16_9",
          });
          const overlaid = await addTitleOverlay(media.data, media.mimeType, project.title);

          const key = `projects/${projectId}/thumbnails/${randomUUID()}.png`;
          const uploaded = await storage.upload({ key, data: overlaid.data, contentType: overlaid.mimeType });
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
