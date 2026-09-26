import request from "supertest";
import { prisma } from "@/db/prisma";
import { redisConnection } from "@/queues/connection";
import { resetDatabase } from "@/tests/testDb";
import { encryptSecret } from "@/utils/crypto";

jest.mock("@/queues/enqueue", () => ({
  enqueueJob: jest.fn().mockResolvedValue({ id: "mock-job-id" }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { createApp } from "@/app";

const app = createApp();

async function registerUser(email: string) {
  const res = await request(app).post("/api/auth/register").send({ email, password: "supersecret123" });
  return { token: res.body.token as string, userId: res.body.user.id as string };
}

async function createPublishingJob(userId: string, overrides: Partial<{ status: string; youtubeVideoId: string | null }> = {}) {
  const project = await prisma.project.create({
    data: { userId, title: "t", concept: "c", status: "PUBLISHED" },
  });
  const youtubeAccount = await prisma.youtubeAccount.create({
    data: {
      userId,
      googleAccountId: `google-${userId}`,
      accessTokenEnc: encryptSecret("access-token"),
      refreshTokenEnc: encryptSecret("refresh-token"),
    },
  });
  const publishingJob = await prisma.publishingJob.create({
    data: {
      projectId: project.id,
      youtubeAccountId: youtubeAccount.id,
      title: "Published title",
      description: "desc",
      confirmedByUser: true,
      status: (overrides.status ?? "COMPLETED") as never,
      youtubeVideoId: overrides.youtubeVideoId === undefined ? "mock-video-1" : overrides.youtubeVideoId,
    },
  });
  return { project, youtubeAccount, publishingJob };
}

describe("GET /api/youtube/publishing-jobs/:id/stats", () => {
  afterEach(async () => {
    await resetDatabase();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await redisConnection.quit();
  });

  it("returns stats for a completed publish owned by the caller", async () => {
    const { token, userId } = await registerUser("owner@example.com");
    const { publishingJob } = await createPublishingJob(userId);

    const res = await request(app)
      .get(`/api/youtube/publishing-jobs/${publishingJob.id}/stats`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.viewCount).toBeGreaterThan(0);
    expect(typeof res.body.likeCount).toBe("number");
    expect(typeof res.body.commentCount).toBe("number");
  });

  it("returns the same stats on repeated calls for the same video", async () => {
    const { token, userId } = await registerUser("repeat@example.com");
    const { publishingJob } = await createPublishingJob(userId);

    const first = await request(app)
      .get(`/api/youtube/publishing-jobs/${publishingJob.id}/stats`)
      .set("Authorization", `Bearer ${token}`);
    const second = await request(app)
      .get(`/api/youtube/publishing-jobs/${publishingJob.id}/stats`)
      .set("Authorization", `Bearer ${token}`);

    expect(second.body).toEqual(first.body);
  });

  it("409s when the publish hasn't completed yet", async () => {
    const { token, userId } = await registerUser("pending@example.com");
    const { publishingJob } = await createPublishingJob(userId, { status: "UPLOADING", youtubeVideoId: null });

    const res = await request(app)
      .get(`/api/youtube/publishing-jobs/${publishingJob.id}/stats`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(409);
  });

  it("404s for a publishing job that does not exist", async () => {
    const { token } = await registerUser("nores@example.com");

    const res = await request(app)
      .get("/api/youtube/publishing-jobs/00000000-0000-0000-0000-000000000000/stats")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it("404s (not 403) when a different user requests someone else's publishing job", async () => {
    const owner = await registerUser("stats-owner@example.com");
    const other = await registerUser("stats-other@example.com");
    const { publishingJob } = await createPublishingJob(owner.userId);

    const res = await request(app)
      .get(`/api/youtube/publishing-jobs/${publishingJob.id}/stats`)
      .set("Authorization", `Bearer ${other.token}`);

    expect(res.status).toBe(404);
  });
});
