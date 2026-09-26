import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker, type Job as BullJob } from "bullmq";
import { prisma } from "@/db/prisma";
import { QUEUE_NAMES } from "../queues";
import { redisConnection } from "../connection";
import { enqueueJob } from "../enqueue";
import { isLastAttempt } from "../retry";
import { jobService } from "@/services/job/JobService";
import { assetService } from "@/services/asset/AssetService";
import { projectService } from "@/services/project/ProjectService";
import { createMusicProvider, createStorageProvider, createVideoRenderer } from "@/services/providers";
import { usageService } from "@/services/usage/UsageService";
import { NotFoundError, ProviderError } from "@/utils/errors";
import { logger } from "@/utils/logger";

interface Payload {
  jobId: string;
  projectId: string;
  pipelineRunId: string;
}

export function startVideoRenderingWorker(): Worker {
  return new Worker<Payload>(
    QUEUE_NAMES.VIDEO_RENDERING,
    async (bullJob: BullJob<Payload>) => {
      const { jobId, projectId } = bullJob.data;
      await jobService.markActive(jobId);
      const startedAt = Date.now();

      try {
        const [project, scenes, captionRecord] = await Promise.all([
          prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
          prisma.scene.findMany({ where: { projectId }, orderBy: { sceneNumber: "asc" } }),
          prisma.caption.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } }),
        ]);

        if (scenes.length === 0) {
          throw new NotFoundError("Scenes for project");
        }

        const storage = createStorageProvider();
        await jobService.updateProgress(jobId, 10);

        const sceneInputs = [];
        for (const scene of scenes) {
          const [image, audio] = await Promise.all([
            assetService.latestReadyForScene(scene.id, "IMAGE"),
            assetService.latestReadyForScene(scene.id, "AUDIO"),
          ]);
          if (!image) {
            throw new ProviderError("video-renderer", `Scene ${scene.sceneNumber} has no ready image asset`, false);
          }
          const visualPath = await storage.resolveLocalPath(image.storageKey);
          const audioPath = audio ? await storage.resolveLocalPath(audio.storageKey) : undefined;
          sceneInputs.push({ visualPath, audioPath, durationSeconds: scene.durationSeconds });
        }
        await jobService.updateProgress(jobId, 40);

        const captionsSrtPath = captionRecord ? await storage.resolveLocalPath(captionRecord.storageKey) : undefined;

        const musicPath =
          project.musicMood === "NONE" ? undefined : await createMusicProvider().getTrack(project.musicMood);

        try {
          const renderer = createVideoRenderer();
          const tmpOutput = path.join(os.tmpdir(), `final-${randomUUID()}.mp4`);
          const result = await renderer.render({
            scenes: sceneInputs,
            musicPath,
            captionsSrtPath,
            aspectRatio: project.aspectRatio,
            outputPath: tmpOutput,
          });
          await jobService.updateProgress(jobId, 80);

          const data = await fs.readFile(tmpOutput);
          const key = `projects/${projectId}/final_video/${randomUUID()}.mp4`;
          const uploaded = await storage.upload({ key, data, contentType: "video/mp4" });
          await fs.rm(tmpOutput, { force: true });

          await prisma.video.create({
            data: {
              projectId,
              storageKey: uploaded.key,
              url: uploaded.url,
              durationSeconds: result.durationSeconds,
              aspectRatio: project.aspectRatio,
              status: "READY",
            },
          });

          const wallClockSeconds = (Date.now() - startedAt) / 1000;
          await usageService.record({
            userId: project.userId,
            projectId,
            type: "RENDER_SECONDS",
            quantity: wallClockSeconds,
            unit: "seconds",
            metadata: { outputDurationSeconds: result.durationSeconds },
          });

          await jobService.markCompleted(jobId, { videoKey: uploaded.key, durationSeconds: result.durationSeconds });

          await projectService.transitionStatus(projectId, "QUALITY_CHECK");
          await enqueueJob({
            projectId,
            type: "QUALITY_CHECK",
            payload: { pipelineRunId: bullJob.data.pipelineRunId },
            idempotencyKey: `quality-check:${bullJob.data.pipelineRunId}`,
          });
        } finally {
          if (musicPath) {
            await fs.rm(path.dirname(musicPath), { recursive: true, force: true }).catch(() => undefined);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Video rendering failed";
        logger.error({ err, projectId, jobId }, "Video rendering worker failed");
        const lastAttempt = isLastAttempt(bullJob);
        await jobService.markFailed(jobId, message, !lastAttempt);
        if (lastAttempt) {
          await projectService.transitionStatus(projectId, "FAILED", message).catch(() => undefined);
        }
        throw err;
      }
    },
    { connection: redisConnection, concurrency: 2 },
  );
}
