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
import { ProjectStateMachine } from "@/services/project/ProjectStateMachine";
import { createMusicProvider, createSoundEffectProvider, createStorageProvider, createVideoRenderer } from "@/services/providers";
import { isSoundEffectName, type SoundEffectName } from "@/services/soundeffect/SoundEffectProvider";
import { parseCameraMotion } from "@/services/video/cameraMotion";
import { parseTransition } from "@/services/video/transitionType";
import { VIDEO_STYLE_CONFIG } from "@/services/video/videoStyle";
import { usageService } from "@/services/usage/UsageService";
import { InvalidStateTransitionError, NotFoundError, ProviderError } from "@/utils/errors";
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

        const soundEffectProvider = createSoundEffectProvider();
        const sfxTempDirs: string[] = [];
        const styleConfig = VIDEO_STYLE_CONFIG[project.videoStyle];

        const sceneInputs = [];
        for (const [sceneIndex, scene] of scenes.entries()) {
          const [image, audio] = await Promise.all([
            assetService.latestReadyForScene(scene.id, "IMAGE"),
            assetService.latestReadyForScene(scene.id, "AUDIO"),
          ]);
          if (!image) {
            throw new ProviderError("video-renderer", `Scene ${scene.sceneNumber} has no ready image asset`, false);
          }
          const visualPath = await storage.resolveLocalPath(image.storageKey);
          const audioPath = audio ? await storage.resolveLocalPath(audio.storageKey) : undefined;

          // The AI is prompted to only use names from SOUND_EFFECT_NAMES,
          // but it's still free-form text in the database -- anything it
          // invented outside that list is skipped rather than failing the
          // scene over a cosmetic accent.
          const effectNames = (Array.isArray(scene.soundEffects) ? scene.soundEffects : []).filter(
            (name): name is SoundEffectName => typeof name === "string" && isSoundEffectName(name),
          );
          const soundEffectPaths: string[] = [];
          for (const name of effectNames) {
            // A sound effect is a cosmetic accent, not something worth
            // failing an otherwise-successful render over -- same
            // reasoning as skipping an AI-invented name above. Scenes
            // already render correctly with zero sound effects (the
            // per-scene audio mix just has one fewer input), so a
            // generation failure here is dropped, not fatal.
            try {
              const sfxPath = await soundEffectProvider.getEffect({ name });
              sfxTempDirs.push(path.dirname(sfxPath));
              soundEffectPaths.push(sfxPath);
            } catch (err) {
              logger.warn({ err, projectId, sceneId: scene.id, name }, "Sound effect generation failed; rendering this scene without it");
            }
          }

          sceneInputs.push({
            visualPath,
            audioPath,
            durationSeconds: scene.durationSeconds,
            soundEffectPaths,
            cameraMotion: parseCameraMotion(scene.cameraDirection, sceneIndex, styleConfig.cameraMotionRotation),
            transitionOut: parseTransition(scene.transition, styleConfig.defaultTransition),
          });
        }
        await jobService.updateProgress(jobId, 40);

        const captionsPath = captionRecord ? await storage.resolveLocalPath(captionRecord.storageKey) : undefined;

        // Background music is optional even when the user picked a mood --
        // FFmpegRenderer already renders a fully-mastered voice-only mix
        // when musicPath is undefined (see normalizeAudioOnly), so a music
        // generation failure degrades the video instead of failing the
        // whole render.
        let musicPath: string | undefined;
        if (project.musicMood !== "NONE") {
          try {
            musicPath = await createMusicProvider().getTrack(project.musicMood);
          } catch (err) {
            logger.warn({ err, projectId, musicMood: project.musicMood }, "Background music generation failed; rendering without music");
          }
        }

        try {
          const renderer = createVideoRenderer();
          const tmpOutput = path.join(os.tmpdir(), `final-${randomUUID()}.mp4`);
          const result = await renderer.render({
            scenes: sceneInputs,
            musicPath,
            captionsPath,
            aspectRatio: project.aspectRatio,
            transitionDurationScale: styleConfig.transitionDurationScale,
            qualityTier: project.qualityTier,
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

          // The render is the expensive, unrecoverable part of this job, and
          // it has already succeeded and been recorded above (Video row,
          // usage record, job COMPLETED). A project cancelled while this job
          // was rendering must not turn that real, finished work into a
          // FAILED job -- letting an InvalidStateTransitionError from this
          // checkpoint propagate to the catch-all below used to do exactly
          // that, and on a non-final attempt would even put the job back to
          // PENDING for BullMQ to retry: re-rendering, re-uploading, and
          // re-billing usage for a video that was already produced. Same
          // isStopped()-vs-benign-retry distinction as
          // contentGeneration.worker.ts's advanceStatus.
          try {
            await projectService.transitionStatus(projectId, "QUALITY_CHECK");
            await enqueueJob({
              projectId,
              type: "QUALITY_CHECK",
              payload: { pipelineRunId: bullJob.data.pipelineRunId },
              idempotencyKey: `quality-check:${bullJob.data.pipelineRunId}`,
            });
          } catch (checkpointErr) {
            if (!(checkpointErr instanceof InvalidStateTransitionError)) throw checkpointErr;
            const current = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { status: true } });
            logger.info(
              { projectId, jobId, status: current.status },
              ProjectStateMachine.isStopped(current.status)
                ? "Render completed but the project is already cancelled/failed; not advancing to quality check"
                : "Skipping quality-check transition; project already moved past it",
            );
          }
        } finally {
          if (musicPath) {
            await fs.rm(path.dirname(musicPath), { recursive: true, force: true }).catch(() => undefined);
          }
          await Promise.all(sfxTempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)));
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
