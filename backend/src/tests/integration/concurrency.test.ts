import { prisma } from "@/db/prisma";
import { jobService } from "@/services/job/JobService";
import { projectService } from "@/services/project/ProjectService";
import { resetDatabase } from "@/tests/testDb";

/**
 * Regression tests for two real races found in review:
 *
 * 1. JobService.create()'s idempotencyKey guard was check-then-act
 *    (findUnique, then create): concurrent callers sharing a key could
 *    all pass the check and race to insert, with every loser after the
 *    first throwing an unhandled unique-constraint error instead of
 *    returning the winner's row. This is exactly what let concurrent
 *    sibling pipeline jobs (e.g. several scenes' visual-generation jobs
 *    finishing at once) each enqueue a full duplicate batch of the next
 *    stage's jobs.
 *
 * 2. ProjectService.transitionStatus() was read-then-write (fetch
 *    current status, assert, then update): two requests racing through
 *    an HTTP action like "generate" or "publish" could both read the
 *    pre-transition status and both proceed, e.g. uploading the same
 *    video to YouTube twice. transitionStatusIfCurrent() closes this
 *    with a single conditional UPDATE instead.
 *
 * Both are exercised here with real concurrent requests against the
 * real local Postgres database (not mocked), because the bug is
 * specifically about what happens when Postgres serializes overlapping
 * writes -- a mock can't reproduce that.
 */
describe("concurrency guards", () => {
  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("JobService.create idempotencyKey race", () => {
    it("collapses N concurrent creates sharing a key into exactly one Job row", async () => {
      const user = await prisma.user.create({ data: { email: "race1@example.com", passwordHash: "unused" } });
      const project = await prisma.project.create({ data: { userId: user.id, title: "t", concept: "c" } });

      const key = "race-test-key";
      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          jobService.create({ projectId: project.id, type: "VOICE_GENERATION", idempotencyKey: key }),
        ),
      );

      // Every concurrent caller must get back the *same* row.
      const uniqueIds = new Set(results.map((r) => r.id));
      expect(uniqueIds.size).toBe(1);

      const rows = await prisma.job.findMany({ where: { idempotencyKey: key } });
      expect(rows).toHaveLength(1);
    });

    it("still creates independent rows for different keys", async () => {
      const user = await prisma.user.create({ data: { email: "race2@example.com", passwordHash: "unused" } });
      const project = await prisma.project.create({ data: { userId: user.id, title: "t", concept: "c" } });

      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          jobService.create({ projectId: project.id, type: "VOICE_GENERATION", idempotencyKey: `distinct-key-${i}` }),
        ),
      );

      expect(new Set(results.map((r) => r.id)).size).toBe(5);
    });
  });

  describe("ProjectService.transitionStatusIfCurrent race", () => {
    it("lets exactly one of N concurrent claims win", async () => {
      const user = await prisma.user.create({ data: { email: "race3@example.com", passwordHash: "unused" } });
      const project = await prisma.project.create({
        data: { userId: user.id, title: "t", concept: "c", status: "READY_FOR_REVIEW" },
      });

      const outcomes = await Promise.all(
        Array.from({ length: 10 }, () => projectService.transitionStatusIfCurrent(project.id, ["READY_FOR_REVIEW"], "PUBLISHING")),
      );

      const winners = outcomes.filter(Boolean);
      expect(winners).toHaveLength(1);

      const finalProject = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      expect(finalProject.status).toBe("PUBLISHING");
    });

    it("rejects a claim once the status has already moved away from the expected source", async () => {
      const user = await prisma.user.create({ data: { email: "race4@example.com", passwordHash: "unused" } });
      const project = await prisma.project.create({
        data: { userId: user.id, title: "t", concept: "c", status: "PUBLISHING" },
      });

      const claimed = await projectService.transitionStatusIfCurrent(project.id, ["READY_FOR_REVIEW"], "PUBLISHING");
      expect(claimed).toBe(false);
    });
  });
});
