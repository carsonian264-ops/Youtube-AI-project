import { Worker, type Job as BullJob } from "bullmq";
import { prisma } from "@/db/prisma";
import { QUEUE_NAMES } from "../queues";
import { redisConnection } from "../connection";
import { jobService } from "@/services/job/JobService";
import { projectService } from "@/services/project/ProjectService";
import { createPublishingProvider, createStorageProvider } from "@/services/providers";
import { usageService } from "@/services/usage/UsageService";
import { decryptSecret } from "@/utils/crypto";
import { NotFoundError } from "@/utils/errors";
import { logger } from "@/utils/logger";

interface Payload {
  jobId: string;
  projectId: string;
  publishingJobId: string;
}

/**
 * The only worker that can ever call out to a publishing destination.
 * It only ever runs because a PublishingJob row exists with
 * confirmedByUser=true, which the route layer enforces before this job
 * is ever enqueued (see publishing.routes.ts) -- there is no automatic
 * or scheduled path that reaches this worker.
 */
export function startPublishingWorker(): Worker {
  return new Worker<Payload>(
    QUEUE_NAMES.PUBLISHING,
    async (bullJob: BullJob<Payload>) => {
      const { jobId, projectId, publishingJobId } = bullJob.data;
      await jobService.markActive(jobId);

      try {
        const publishingJob = await prisma.publishingJob.findUniqueOrThrow({
          where: { id: publishingJobId },
          include: { youtubeAccount: true },
        });

        if (!publishingJob.confirmedByUser) {
          throw new Error("Publishing job was not confirmed by the user");
        }

        const [video, thumbnail, project] = await Promise.all([
          prisma.video.findFirst({ where: { projectId, status: "READY" }, orderBy: { createdAt: "desc" } }),
          prisma.thumbnail.findFirst({ where: { projectId, isSelected: true } }),
          prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
        ]);
        if (!video) throw new NotFoundError("Ready video for project");

        const storage = createStorageProvider();
        const videoFilePath = await storage.resolveLocalPath(video.storageKey);
        const thumbnailFilePath = thumbnail ? await storage.resolveLocalPath(thumbnail.storageKey) : undefined;

        await prisma.publishingJob.update({ where: { id: publishingJobId }, data: { status: "UPLOADING" } });

        const publishingProvider = createPublishingProvider();
        const result = await publishingProvider.publish({
          accessToken: decryptSecret(publishingJob.youtubeAccount.accessTokenEnc),
          refreshToken: decryptSecret(publishingJob.youtubeAccount.refreshTokenEnc),
          videoFilePath,
          thumbnailFilePath,
          title: publishingJob.title,
          description: publishingJob.description,
          tags: publishingJob.tags as string[],
          visibility: publishingJob.visibility,
        });

        await prisma.publishingJob.update({
          where: { id: publishingJobId },
          data: { status: "COMPLETED", youtubeVideoId: result.externalVideoId },
        });

        await usageService.record({
          userId: project.userId,
          projectId,
          type: "YOUTUBE_UPLOAD",
          quantity: 1,
          unit: "upload",
          metadata: { externalVideoId: result.externalVideoId, url: result.url },
        });

        await jobService.markCompleted(jobId, { externalVideoId: result.externalVideoId, url: result.url });
        await projectService.transitionStatus(projectId, "PUBLISHED");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Publishing failed";
        logger.error({ err, projectId, jobId, publishingJobId }, "Publishing worker failed");
        await prisma.publishingJob.update({ where: { id: publishingJobId }, data: { status: "FAILED", errorMessage: message } }).catch(() => undefined);
        await jobService.markFailed(jobId, message, false);
        // Revert the PUBLISHING claim so the project isn't stranded in a
        // state the API layer won't let anything transition out of --
        // the user can review the failure and retry publishing.
        await projectService.transitionStatusIfCurrent(projectId, ["PUBLISHING"], "READY_FOR_REVIEW").catch(() => undefined);
        throw err;
      }
    },
    { connection: redisConnection, concurrency: 2 },
  );
}
