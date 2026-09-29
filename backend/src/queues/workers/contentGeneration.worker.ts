import { Worker, type Job as BullJob } from "bullmq";
import { prisma } from "@/db/prisma";
import { QUEUE_NAMES } from "../queues";
import { redisConnection } from "../connection";
import { enqueueJob } from "../enqueue";
import { isLastAttempt } from "../retry";
import { jobService } from "@/services/job/JobService";
import { projectService } from "@/services/project/ProjectService";
import { ProjectStateMachine } from "@/services/project/ProjectStateMachine";
import type { ProjectStatus } from "@/generated/prisma";
import { createAIContentProvider } from "@/services/providers";
import type { ProjectPlan } from "@/services/ai/schemas";
import { InvalidStateTransitionError } from "@/utils/errors";
import { logger } from "@/utils/logger";

/**
 * Thrown by advanceStatus when the project has been cancelled (or failed)
 * out from under an in-flight full-plan job, so processFullPlan can stop
 * immediately instead of continuing to overwrite the script/scenes and
 * enqueue a fresh wave of visual-generation jobs for a project the user
 * already told the app to stop. Deliberately not a generic Error the
 * catch-all below would treat as a failure: this is the pipeline
 * correctly noticing a cancellation, not something that went wrong.
 */
class ProjectTerminatedError extends Error {}

/**
 * Moves the project forward to a pipeline checkpoint status. An illegal
 * transition is either a harmless no-op (on a BullMQ retry of this same
 * job, the project may already be sitting past `to` from a previous
 * attempt that got further before a late transient failure -- this
 * function reruns the whole stage from scratch regardless, so refusing to
 * proceed here would turn a recoverable retry into a permanent crash
 * loop) or a sign the project was cancelled/failed while this job was
 * still running. Those two cases used to be treated identically -- both
 * silently swallowed -- which let a cancelled project's in-flight job
 * keep going: overwriting its script/scenes and enqueueing a whole new
 * round of visual-generation jobs even though the user had already
 * cancelled it. Checking whether the *current* status is terminal
 * distinguishes "already moved forward, fine to continue" from "already
 * stopped, must not continue." Uses isStopped() rather than isTerminal():
 * a project that failed via a *different* job/path (not this one) is just
 * as much a reason to stop as an explicit cancellation, even though FAILED
 * itself isn't "terminal" in the state machine's forward-transition sense
 * (a user can still retry a failed project back to PLANNING).
 */
async function advanceStatus(projectId: string, to: ProjectStatus): Promise<void> {
  try {
    await projectService.transitionStatus(projectId, to);
  } catch (err) {
    if (err instanceof InvalidStateTransitionError) {
      const current = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { status: true } });
      if (ProjectStateMachine.isStopped(current.status)) {
        throw new ProjectTerminatedError(
          `Project ${projectId} is already ${current.status}; stopping content generation instead of resurrecting it`,
        );
      }
      logger.info({ projectId, to }, "Skipping checkpoint status transition; project already moved past it");
      return;
    }
    throw err;
  }
}

/** See ProjectTerminatedError's docs -- checked right after each slow AI call, before persisting its result. */
async function assertNotTerminated(projectId: string, discarding: string): Promise<void> {
  const current = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { status: true } });
  if (ProjectStateMachine.isStopped(current.status)) {
    throw new ProjectTerminatedError(`Project ${projectId} is already ${current.status}; discarding ${discarding} instead of persisting it`);
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
    // The AI call above is the slow part of this job (seconds to tens of
    // seconds) and by far the most realistic window for a user to cancel
    // the project while this job is still ACTIVE. Checking right here,
    // before writing anything, stops a cancelled project from getting a
    // script/scenes it never asked to keep -- the advanceStatus checks
    // below still catch the (much narrower) gap around the second AI call
    // and, most importantly, before this stage fans out into a fresh
    // round of paid visual-generation jobs.
    await assertNotTerminated(projectId, "the generated plan");
    await jobService.updateProgress(jobId, 30);

    const latestScript = await prisma.script.findFirst({ where: { projectId }, orderBy: { versionNumber: "desc" } });
    const versionNumber = (latestScript?.versionNumber ?? 0) + 1;
    // Each of these four writes was previously its own separate statement:
    // a crash (deploy restart, OOM kill) between any two of them -- e.g.
    // right after scene.deleteMany but before scene.createMany -- used to
    // permanently wipe the project's scenes (or leave zero active scripts)
    // with no way to recover short of manually re-running generation, since
    // a retry of *this* job is the only thing that would ever redo the
    // write, and only if this wasn't the job's last attempt. Wrapping them
    // in one transaction makes "replace the project's active script and
    // scenes" atomic: either all four happen, or none do.
    await prisma.$transaction([
      prisma.script.updateMany({ where: { projectId }, data: { isActive: false } }),
      prisma.script.create({ data: { projectId, versionNumber, content: plan, isActive: true } }),
      prisma.scene.deleteMany({ where: { projectId } }),
      prisma.scene.createMany({
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
      }),
    ]);
    await jobService.updateProgress(jobId, 60);
    await advanceStatus(projectId, "SCRIPT_READY");

    const bible = await ai.generateCharacterBible(plan);
    await assertNotTerminated(projectId, "the character bible");
    // Same atomicity concern as the script/scenes transaction above. An
    // empty `data` array is a valid no-op createMany, so this doesn't need
    // a conditional branch (which would otherwise produce two differently-
    // shaped tuples and trip up $transaction's array overload).
    await prisma.$transaction([
      prisma.character.deleteMany({ where: { projectId } }),
      prisma.character.createMany({
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
      }),
    ]);
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
    if (err instanceof ProjectTerminatedError) {
      logger.info({ projectId, jobId }, err.message);
      await jobService.markCancelled(jobId, err.message);
      return;
    }
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

    const updatedPlan: ProjectPlan = {
      ...plan,
      scenes: plan.scenes.map((s) => (s.sceneNumber === scene.sceneNumber ? regenerated : s)),
    };
    // Both writes describe the same regenerated scene -- the Scene row (what
    // rendering actually reads) and the script's cached ProjectPlan JSON
    // (what a *later* scene regeneration uses to rebuild AI context). A
    // crash between them would leave the two out of sync: the scene shows
    // the new content, but a subsequent regeneration would build its prompt
    // from the stale plan, silently discarding this regeneration's changes.
    await prisma.$transaction([
      prisma.scene.update({
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
      }),
      prisma.script.update({ where: { id: script.id }, data: { content: updatedPlan } }),
    ]);

    await jobService.markCompleted(jobId, { sceneId, sceneNumber: scene.sceneNumber });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scene regeneration failed";
    logger.error({ err, projectId, jobId, sceneId }, "Scene-only content generation failed");
    await jobService.markFailed(jobId, message, !isLastAttempt(bullJob));
    throw err;
  }
}
