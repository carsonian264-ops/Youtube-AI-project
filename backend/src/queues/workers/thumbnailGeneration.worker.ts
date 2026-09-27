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
        // thumbnails): exaggerated reactions, oversaturated contrast, and
        // large bold title text baked into the image -- not a plain,
        // minimal-text product shot. Diffusion models still render text
        // imperfectly, so this is a best-effort ask, not a guarantee; the
        // composition/mood improvement holds even when the lettering itself
        // comes out rough.
        const basePrompt = `Viral, high-click-through-rate YouTube thumbnail for a video titled "${project.title}" about: ${project.concept}. Photorealistic, oversaturated high-contrast colors, professional movie-poster composition. Bake the bold title text "${project.title}" into the image as large, thick, outlined block lettering (like a Nollywood or MrBeast-style thumbnail) -- eye-catching and attention-grabbing, but not misleading.`;
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
