import "dotenv/config";
import { logger } from "@/utils/logger";
import { startContentGenerationWorker } from "./workers/contentGeneration.worker";
import { startVisualGenerationWorker } from "./workers/visualGeneration.worker";
import { startVoiceGenerationWorker } from "./workers/voiceGeneration.worker";
import { startCaptionGenerationWorker } from "./workers/captionGeneration.worker";
import { startVideoRenderingWorker } from "./workers/videoRendering.worker";
import { startThumbnailGenerationWorker } from "./workers/thumbnailGeneration.worker";
import { startQualityCheckWorker } from "./workers/qualityCheck.worker";
import { startPublishingWorker } from "./workers/publishing.worker";

/**
 * Worker process entrypoint. Runs separately from the API server
 * (`npm run dev:worker` / `npm run start:worker`) so long-running
 * AI/media/FFmpeg work never blocks HTTP request handling, and so the
 * worker fleet can be scaled independently of the API in production
 * (see DEPLOYMENT.md).
 */
const workers = [
  startContentGenerationWorker(),
  startVisualGenerationWorker(),
  startVoiceGenerationWorker(),
  startCaptionGenerationWorker(),
  startVideoRenderingWorker(),
  startThumbnailGenerationWorker(),
  startQualityCheckWorker(),
  startPublishingWorker(),
];

for (const worker of workers) {
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, queue: worker.name, err }, "Job failed");
  });
  worker.on("error", (err) => {
    logger.error({ queue: worker.name, err }, "Worker error");
  });
}

logger.info({ queues: workers.map((w) => w.name) }, "Background workers started");

async function shutdown() {
  logger.info("Shutting down workers...");
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
