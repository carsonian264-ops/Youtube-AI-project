import { Worker, type Job as BullJob } from "bullmq";
import { prisma } from "@/db/prisma";
import { QUEUE_NAMES } from "../queues";
import { redisConnection } from "../connection";
import { enqueueJob } from "../enqueue";
import { isLastAttempt } from "../retry";
import { jobService } from "@/services/job/JobService";
import { projectService } from "@/services/project/ProjectService";
import type { ProjectStatus } from "@/generated/prisma";
import { createAIContentProvider } from "@/services/providers";
import type { ProjectPlan } from "@/services/ai/schemas";
import { InvalidStateTransitionError } from "@/utils/errors";
import { logger } from "@/utils/logger";

/**
 * Moves the project forward to a pipeline checkpoint status, but treats an
 * illegal transition as a harmless no-op rather than a hard failure: on a
 * BullMQ retry of this same job, the project may already be sitting past
 * `to` (e.g. a previous attempt got all the way to ASSETS_GENERATING
 * before a late transient failure), and this function reruns the whole
 * pipeline stage from scratch regardless (it's idempotent -- scenes and
 * characters are deleted and recreated). Refusing to proceed just because
 * a status marker can no longer move forward would turn a recoverable
 * retry into a permanent crash loop.
 */
async function advanceStatus(projectId: string, to: ProjectStatus): Promise<void> {
  try {
    await projectService.transitionStatus(projectId, to);
  } catch (err) {
    if (err instanceof InvalidStateTransitionError) {
      logger.info({ projectId, to }, "Skipping checkpoint status transition; project already moved past it");
      return;
    }
    throw err;
  }
}

interface FullPlanPayload {
  jobId: string;
  projectId: string;
  pipelineRunId: string;
  sceneOnly?: false;
  idea: string;
  targetDurationSeconds?: number;
  tone?: string;
}

interface SceneOnlyPayload {
  jobId: string;
  projectId: string;
  pipelineRunId: string;
  sceneOnly: true;
  sceneId: string;
  instructions?: string;
}

type Payload = FullPlanPayload | SceneOnlyPayload;

async function loadCharacterBible(projectId: string) {
  const characters = await prisma.character.findMany({ where: { projectId } });
  return {
    characters: characters.map((c) => ({
      name: c.name,
      appearance: c.appearance,
      clothing: c.clothing ?? "",
      personality: c.personality ?? "",
      ageCategory: c.ageCategory ?? "",
      colors: (c.colors as string[]) ?? [],
      visualStyle: c.visualStyle ?? "",
      environment: c.environment ?? "",
      recurringObjects: (c.recurringObjects as string[]) ?? [],
    })),
  };
}

/**
 * Handles two related but distinct operations on the "content-generation"
 * queue: generating a project's full script/scene-breakdown/character
 * bible from scratch (spec's core POST /projects/:id/generate flow), and
 * regenerating a single scene's script in place (POST
 * /scenes/:id/regenerate) without touching the rest of the project --
 * this is what lets a user fix one beat without paying for/waiting on a
 * full regeneration.
 */
export function startContentGenerationWorker(): Worker {
  return new Worker<Payload>(
    QUEUE_NAMES.CONTENT_GENERATION,
    async (bullJob: BullJob<Payload>) => {
      if (bullJob.data.sceneOnly) {
        await processSceneOnly(bullJob.data, bullJob);
      } else {
        await processFullPlan(bullJob.data, bullJob);
      }
    },
    { connection: redisConnection, concurrency: 4 },
  );
}

async function processFullPlan(data: FullPlanPayload, bullJob: BullJob<Payload>): Promise<void> {
  const { jobId, projectId, pipelineRunId, idea, targetDurationSeconds, tone } = data;
  await jobService.markActive(jobId);

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const ai = createAIContentProvider({ userId: project.userId, projectId, jobId });

  try {
    await advanceStatus(projectId, "SCRIPT_GENERATING");
    const plan = await ai.generateProjectPlan({ idea, targetDurationSeconds, tone });
    await jobService.updateProgress(jobId, 30);

    const latestScript = await prisma.script.findFirst({ where: { projectId }, orderBy: { versionNumber: "desc" } });
    const versionNumber = (latestScript?.versionNumber ?? 0) + 1;
    await prisma.script.updateMany({ where: { projectId }, data: { isActive: false } });
    await prisma.script.create({ data: { projectId, versionNumber, content: plan, isActive: true } });

    await prisma.scene.deleteMany({ where: { projectId } });
    await prisma.scene.createMany({
      data: plan.scenes.map((scene) => ({
        projectId,
        sceneNumber: scene.sceneNumber,
        title: scene.title,
        narration: scene.narration,
        visualDescription: scene.visualDescription,
        visualPrompt: scene.visualPrompt,
        cameraDirection: scene.cameraDirection,
        durationSeconds: scene.durationSeconds,
        soundEffects: scene.soundEffects,
        transition: scene.transition,
      })),
    });
    await jobService.updateProgress(jobId, 60);
    await advanceStatus(projectId, "SCRIPT_READY");

    const bible = await ai.generateCharacterBible(plan);
    await prisma.character.deleteMany({ where: { projectId } });
    if (bible.characters.length > 0) {
      await prisma.character.createMany({
        data: bible.characters.map((c) => ({
          projectId,
          name: c.name,
          appearance: c.appearance,
          clothing: c.clothing,
          personality: c.personality,
          ageCategory: c.ageCategory,
          colors: c.colors,
          visualStyle: c.visualStyle,
          environment: c.environment,
          recurringObjects: c.recurringObjects,
        })),
      });
    }
    await advanceStatus(projectId, "SCENES_READY");

    const scenes = await prisma.scene.findMany({ where: { projectId }, orderBy: { sceneNumber: "asc" } });
    await advanceStatus(projectId, "ASSETS_GENERATING");
    for (const scene of scenes) {
      await enqueueJob({
        projectId,
        type: "VISUAL_GENERATION",
        payload: { pipelineRunId, sceneId: scene.id },
        idempotencyKey: `visual-generation:${pipelineRunId}:${scene.id}`,
      });
    }

    // Marked completed only once every downstream job has actually been
    // handed off -- doing this earlier (before the enqueue loop) meant a
    // late failure in that loop would try to mark an already-COMPLETED
    // job record back to FAILED, leaving contradictory job/attempt rows.
    await jobService.markCompleted(jobId, { sceneCount: plan.scenes.length, characterCount: bible.characters.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Content generation failed";
    logger.error({ err, projectId, jobId }, "Content generation worker failed");
    const lastAttempt = isLastAttempt(bullJob);
    await jobService.markFailed(jobId, message, !lastAttempt);
    if (lastAttempt) {
      await projectService.transitionStatus(projectId, "FAILED", message).catch(() => undefined);
    }
    throw err;
  }
}

async function processSceneOnly(data: SceneOnlyPayload, bullJob: BullJob<Payload>): Promise<void> {
  const { jobId, projectId, sceneId, instructions } = data;
  await jobService.markActive(jobId);

  try {
    const [project, script] = await Promise.all([
      prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
      prisma.script.findFirst({ where: { projectId, isActive: true } }),
    ]);
    if (!script) throw new Error(`Project ${projectId} has no active script; generate one before regenerating a scene`);

    const scene = await prisma.scene.findUniqueOrThrow({ where: { id: sceneId } });
    const plan = script.content as unknown as ProjectPlan;
    const characterBible = await loadCharacterBible(projectId);

    const ai = createAIContentProvider({ userId: project.userId, projectId, jobId });
    const regenerated = await ai.regenerateScene({ plan, characterBible, sceneNumber: scene.sceneNumber, instructions });

    await prisma.scene.update({
      where: { id: sceneId },
      data: {
        title: regenerated.title,
        narration: regenerated.narration,
        visualDescription: regenerated.visualDescription,
        visualPrompt: regenerated.visualPrompt,
        cameraDirection: regenerated.cameraDirection,
        durationSeconds: regenerated.durationSeconds,
        soundEffects: regenerated.soundEffects,
        transition: regenerated.transition,
        status: "PENDING",
      },
    });

    const updatedPlan: ProjectPlan = {
      ...plan,
      scenes: plan.scenes.map((s) => (s.sceneNumber === scene.sceneNumber ? regenerated : s)),
    };
    await prisma.script.update({ where: { id: script.id }, data: { content: updatedPlan } });

    await jobService.markCompleted(jobId, { sceneId, sceneNumber: scene.sceneNumber });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scene regeneration failed";
    logger.error({ err, projectId, jobId, sceneId }, "Scene-only content generation failed");
    await jobService.markFailed(jobId, message, !isLastAttempt(bullJob));
    throw err;
  }
}
