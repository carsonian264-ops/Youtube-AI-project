import type { Worker } from "bullmq";
import { prisma } from "@/db/prisma";
import { resetDatabase } from "@/tests/testDb";
import { enqueueJob } from "@/queues/enqueue";
import { redisConnection } from "@/queues/connection";
import { queues } from "@/queues/queues";
import { startVoiceGenerationWorker } from "@/queues/workers/voiceGeneration.worker";

/**
 * Regression coverage for the same "fan-in only runs on the success path"
 * bug fixed in visualGeneration.worker.ts: if every scene's narration
 * permanently fails, nothing used to ever check whether the batch was
 * done, leaving the project stuck in AUDIO_GENERATING forever with no
 * visible error. A nonexistent sceneId makes the scene lookup throw
 * deterministically on every retry attempt, simulating a permanently
 * broken voice provider without depending on real provider behavior.
 */
describe("voice-generation queue (real BullMQ + real Redis)", () => {
  let worker: Worker;
  let userId: string;
  let projectId: string;
  let sceneAId: string;
  let sceneBId: string;

  beforeAll(() => {
    worker = startVoiceGenerationWorker();
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
      data: { email: `voice-queue-test-${Date.now()}@example.com`, passwordHash: "unused" },
    });
    userId = user.id;
    const project = await prisma.project.create({
      data: { userId, title: "Voice queue test", concept: "Testing fan-in", status: "AUDIO_GENERATING" },
    });
    projectId = project.id;

    const [sceneA, sceneB] = await Promise.all([
      prisma.scene.create({
        data: {
          projectId,
          sceneNumber: 1,
          title: "A",
          narration: "Hello from scene A",
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
          narration: "Hello from scene B",
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

  it("fails the project when every scene's narration permanently fails, instead of hanging in AUDIO_GENERATING forever", async () => {
    const pipelineRunId = "all-fail-run";

    const jobA = await enqueueJob({
      projectId,
      type: "VOICE_GENERATION",
      payload: { pipelineRunId, sceneId: "00000000-0000-0000-0000-000000000001" },
    });
    const jobB = await enqueueJob({
      projectId,
      type: "VOICE_GENERATION",
      payload: { pipelineRunId, sceneId: "00000000-0000-0000-0000-000000000002" },
    });

    await waitForJobStatus(jobA.id, ["FAILED"], 30_000);
    await waitForJobStatus(jobB.id, ["FAILED"], 30_000);

    const updated = await waitForProjectStatus(projectId, ["FAILED"], 10_000);
    expect(updated.status).toBe("FAILED");
    expect(updated.failureReason).toContain("2 scene narration(s) failed to generate");

    const captionJobs = await prisma.job.findMany({ where: { projectId, type: "CAPTION_GENERATION" } });
    expect(captionJobs).toHaveLength(0);
  }, 40_000);

  it("still cascades to caption generation when only some scenes' narration fails (partial failure stays permissive)", async () => {
    const pipelineRunId = "partial-fail-run";

    const okJob = await enqueueJob({ projectId, type: "VOICE_GENERATION", payload: { pipelineRunId, sceneId: sceneAId } });
    const failJob = await enqueueJob({
      projectId,
      type: "VOICE_GENERATION",
      payload: { pipelineRunId, sceneId: "00000000-0000-0000-0000-000000000003" },
    });

    await waitForJobStatus(okJob.id, ["COMPLETED"], 15_000);
    await waitForJobStatus(failJob.id, ["FAILED"], 30_000);

    const captionJobs = await waitForJobCount(projectId, "CAPTION_GENERATION", 1);
    expect(captionJobs).toHaveLength(1);
  }, 40_000);

  it("sceneOnly regenerates just the one scene without triggering the batch fan-in", async () => {
    await prisma.project.update({ where: { id: projectId }, data: { status: "READY_FOR_REVIEW" } });

    const job = await enqueueJob({
      projectId,
      type: "VOICE_GENERATION",
      payload: { pipelineRunId: "manual-regen", sceneId: sceneAId, sceneOnly: true },
    });

    const completed = await waitForJobStatus(job.id, ["COMPLETED", "FAILED"]);
    expect(completed.status).toBe("COMPLETED");

    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.status).toBe("READY_FOR_REVIEW");

    const captionJobs = await prisma.job.findMany({ where: { projectId, type: "CAPTION_GENERATION" } });
    expect(captionJobs).toHaveLength(0);
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

async function waitForJobCount(projectId: string, type: "CAPTION_GENERATION", count: number, timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const jobs = await prisma.job.findMany({ where: { projectId, type } });
    if (jobs.length >= count) return jobs;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Project ${projectId} did not reach ${count} ${type} jobs within ${timeoutMs}ms`);
}

async function waitForProjectStatus(projectId: string, statuses: string[], timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    if (statuses.includes(project.status)) return project;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Project ${projectId} did not reach status ${statuses.join("/")} within ${timeoutMs}ms`);
}
