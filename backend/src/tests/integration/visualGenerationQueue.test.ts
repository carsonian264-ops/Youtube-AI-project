import type { Worker } from "bullmq";
import { prisma } from "@/db/prisma";
import { resetDatabase } from "@/tests/testDb";
import { enqueueJob } from "@/queues/enqueue";
import { redisConnection } from "@/queues/connection";
import { queues } from "@/queues/queues";
import { startVisualGenerationWorker } from "@/queues/workers/visualGeneration.worker";

/**
 * Regression coverage for the sceneOnly flag (see its docs in
 * visualGeneration.worker.ts): a manually-triggered, single-scene visual
 * regeneration used to get its own fresh pipelineRunId, which made the
 * worker's "have all of this pipeline run's jobs finished?" fan-in check
 * see 1-of-1 done after just that one scene -- treating it as the *whole*
 * project's assets finishing. On an already-finished project that forced
 * an illegal ProjectStatus transition (READY_FOR_REVIEW -> AUDIO_GENERATING
 * isn't legal), which overwrote the job's own already-COMPLETED status
 * back to FAILED and re-queued voice generation for every scene, not just
 * the one that was regenerated.
 */
describe("visual-generation queue (real BullMQ + real Redis)", () => {
  let worker: Worker;
  let userId: string;
  let projectId: string;
  let sceneAId: string;
  let sceneBId: string;

  beforeAll(() => {
    worker = startVisualGenerationWorker();
  });

  afterAll(async () => {
    await worker.close();
    await Promise.all(Object.values(queues).map((q) => q.obliterate({ force: true })));
    await Promise.all(Object.values(queues).map((q) => q.close()));
    await redisConnection.quit();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: { email: `visual-queue-test-${Date.now()}@example.com`, passwordHash: "unused" },
    });
    userId = user.id;
    const project = await prisma.project.create({
      data: { userId, title: "Visual queue test", concept: "Testing sceneOnly", status: "READY_FOR_REVIEW" },
    });
    projectId = project.id;

    const [sceneA, sceneB] = await Promise.all([
      prisma.scene.create({
        data: {
          projectId,
          sceneNumber: 1,
          title: "A",
          narration: "n",
          visualDescription: "d",
          visualPrompt: "p",
          durationSeconds: 5,
          status: "READY",
        },
      }),
      prisma.scene.create({
        data: {
          projectId,
          sceneNumber: 2,
          title: "B",
          narration: "n",
          visualDescription: "d",
          visualPrompt: "p",
          durationSeconds: 5,
          status: "READY",
        },
      }),
    ]);
    sceneAId = sceneA.id;
    sceneBId = sceneB.id;
  });

  afterEach(async () => {
    await resetDatabase();
  });

  it("sceneOnly regenerates just the one scene without touching project status or the other scene", async () => {
    const job = await enqueueJob({
      projectId,
      type: "VISUAL_GENERATION",
      payload: { pipelineRunId: "manual-regen", sceneId: sceneAId, sceneOnly: true },
    });

    const completed = await waitForJobStatus(job.id, ["COMPLETED", "FAILED"]);
    expect(completed.status).toBe("COMPLETED");

    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.status).toBe("READY_FOR_REVIEW");

    const newAsset = await prisma.asset.findFirst({ where: { sceneId: sceneAId, type: "IMAGE" } });
    expect(newAsset).not.toBeNull();

    const voiceJobs = await prisma.job.findMany({ where: { projectId, type: "VOICE_GENERATION" } });
    expect(voiceJobs).toHaveLength(0);
  }, 20_000);

  it("without sceneOnly, a full batch still cascades to audio generation once every scene is done", async () => {
    await prisma.project.update({ where: { id: projectId }, data: { status: "ASSETS_GENERATING" } });
    const pipelineRunId = "full-pipeline-run";

    const jobA = await enqueueJob({ projectId, type: "VISUAL_GENERATION", payload: { pipelineRunId, sceneId: sceneAId } });
    const jobB = await enqueueJob({ projectId, type: "VISUAL_GENERATION", payload: { pipelineRunId, sceneId: sceneBId } });

    await waitForJobStatus(jobA.id, ["COMPLETED", "FAILED"]);
    await waitForJobStatus(jobB.id, ["COMPLETED", "FAILED"]);

    // Both visual jobs reaching COMPLETED only means the cascade check has
    // *started* -- transitioning the project and enqueueing the two voice
    // jobs happens after that, in the same handler invocation, so it can
    // still be in flight for a moment after the row above is visible.
    const voiceJobs = await waitForJobCount(projectId, "VOICE_GENERATION", 2);
    expect(voiceJobs).toHaveLength(2);

    const updated = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(updated.status).toBe("AUDIO_GENERATING");
  }, 20_000);
});

async function waitForJobStatus(jobId: string, statuses: string[], timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    if (statuses.includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Job ${jobId} did not reach status ${statuses.join("/")} within ${timeoutMs}ms`);
}

async function waitForJobCount(projectId: string, type: "VOICE_GENERATION", count: number, timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const jobs = await prisma.job.findMany({ where: { projectId, type } });
    if (jobs.length >= count) return jobs;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Project ${projectId} did not reach ${count} ${type} jobs within ${timeoutMs}ms`);
}
