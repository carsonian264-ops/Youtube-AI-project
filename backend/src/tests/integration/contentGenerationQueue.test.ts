import type { Worker } from "bullmq";
import { prisma } from "@/db/prisma";
import { resetDatabase } from "@/tests/testDb";
import { enqueueJob } from "@/queues/enqueue";
import { redisConnection } from "@/queues/connection";
import { queues } from "@/queues/queues";
import { startContentGenerationWorker } from "@/queues/workers/contentGeneration.worker";

/**
 * Exercises the real BullMQ queue + a real Worker against the real local
 * Redis instance (no mocking) -- this is the "queue/job processing" test
 * called for in spec section 27. Only the content-generation queue is
 * started here (it doesn't require FFmpeg), which is enough to prove
 * jobs actually flow: enqueue -> Job row PENDING -> worker picks it up ->
 * Job row COMPLETED -> Script/Scene/Character rows persisted.
 */
describe("content-generation queue (real BullMQ + real Redis)", () => {
  let worker: Worker;
  let userId: string;
  let projectId: string;

  beforeAll(() => {
    worker = startContentGenerationWorker();
  });

  afterAll(async () => {
    await worker.close();
    // A completed full-plan job enqueues VISUAL_GENERATION jobs as a side
    // effect (see contentGeneration.worker.ts's processFullPlan), and
    // nothing in this test file consumes that queue -- so it's not just
    // "content-generation" that needs clearing, but every queue this
    // suite could have cascaded into. Left uncleared, those jobs sit in
    // Redis pointing at Postgres rows resetDatabase() already removed,
    // and get picked up by an unrelated dev worker process later,
    // producing "Record to update not found" errors that have nothing to
    // do with that process's own work.
    await Promise.all(Object.values(queues).map((q) => q.obliterate({ force: true })));
    await Promise.all(Object.values(queues).map((q) => q.close()));
    await redisConnection.quit();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: { email: `queue-test-${Date.now()}@example.com`, passwordHash: "unused" },
    });
    userId = user.id;
    const project = await prisma.project.create({
      data: { userId, title: "Queue test", concept: "How queues work", status: "PLANNING" },
    });
    projectId = project.id;
  });

  afterEach(async () => {
    await resetDatabase();
  });

  it("processes a full-plan job end to end and persists script/scenes/characters", async () => {
    const job = await enqueueJob({
      projectId,
      type: "CONTENT_GENERATION",
      payload: { pipelineRunId: "test-run", idea: "How queues work", targetDurationSeconds: 60 },
    });

    const completed = await waitForJobStatus(job.id, ["COMPLETED", "FAILED"]);
    expect(completed.status).toBe("COMPLETED");

    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.status).toBe("ASSETS_GENERATING");

    const scenes = await prisma.scene.findMany({ where: { projectId } });
    expect(scenes.length).toBeGreaterThan(0);

    const script = await prisma.script.findFirst({ where: { projectId, isActive: true } });
    expect(script).not.toBeNull();
  }, 20_000);

  it("is idempotent: re-enqueueing with the same idempotencyKey does not create a second job", async () => {
    const first = await enqueueJob({
      projectId,
      type: "CONTENT_GENERATION",
      payload: { pipelineRunId: "test-run", idea: "idempotency check", targetDurationSeconds: 30 },
      idempotencyKey: "fixed-key-1",
    });
    const second = await enqueueJob({
      projectId,
      type: "CONTENT_GENERATION",
      payload: { pipelineRunId: "test-run", idea: "a different idea entirely", targetDurationSeconds: 30 },
      idempotencyKey: "fixed-key-1",
    });

    expect(second.id).toBe(first.id);
    const jobs = await prisma.job.findMany({ where: { projectId, type: "CONTENT_GENERATION" } });
    expect(jobs).toHaveLength(1);

    // Let the single underlying job actually finish before this test (and
    // the afterEach reset that follows it) returns -- otherwise the
    // worker can still be mid-flight against a Job row the next test's
    // resetDatabase() has already deleted, which produces harmless but
    // confusing "record not found" log noise.
    await waitForJobStatus(first.id, ["COMPLETED", "FAILED"]);
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
