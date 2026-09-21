import request from "supertest";
import { prisma } from "@/db/prisma";
import { redisConnection } from "@/queues/connection";
import { resetDatabase } from "@/tests/testDb";

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

describe("Scene/Asset/Job ownership", () => {
  afterEach(async () => {
    await resetDatabase();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await redisConnection.quit();
  });

  it("prevents user B from regenerating or generating assets for user A's scene", async () => {
    const userA = await registerUser("scenea@example.com");
    const userB = await registerUser("sceneb@example.com");

    const project = await prisma.project.create({
      data: { userId: userA.userId, title: "t", concept: "c", status: "SCENES_READY" },
    });
    const scene = await prisma.scene.create({
      data: {
        projectId: project.id,
        sceneNumber: 1,
        title: "Scene 1",
        narration: "n",
        visualDescription: "d",
        visualPrompt: "p",
      },
    });

    const regen = await request(app).post(`/api/scenes/${scene.id}/regenerate`).set("Authorization", `Bearer ${userB.token}`);
    expect(regen.status).toBe(403);

    const visual = await request(app).post(`/api/scenes/${scene.id}/visual`).set("Authorization", `Bearer ${userB.token}`);
    expect(visual.status).toBe(403);

    const voice = await request(app).post(`/api/scenes/${scene.id}/voice`).set("Authorization", `Bearer ${userB.token}`);
    expect(voice.status).toBe(403);

    const asOwner = await request(app).post(`/api/scenes/${scene.id}/visual`).set("Authorization", `Bearer ${userA.token}`);
    expect(asOwner.status).toBe(202);
  });

  it("returns 404 for a scene id that does not exist", async () => {
    const { token } = await registerUser("scenenf@example.com");
    const res = await request(app)
      .post("/api/scenes/00000000-0000-0000-0000-000000000000/visual")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("prevents user B from reading user A's asset", async () => {
    const userA = await registerUser("asseta@example.com");
    const userB = await registerUser("assetb@example.com");

    const project = await prisma.project.create({
      data: { userId: userA.userId, title: "t", concept: "c" },
    });
    const asset = await prisma.asset.create({
      data: {
        projectId: project.id,
        type: "IMAGE",
        provider: "mock",
        storageKey: "projects/x/image/1.png",
        status: "READY",
      },
    });

    const asOther = await request(app).get(`/api/assets/${asset.id}`).set("Authorization", `Bearer ${userB.token}`);
    expect(asOther.status).toBe(403);

    const asOwner = await request(app).get(`/api/assets/${asset.id}`).set("Authorization", `Bearer ${userA.token}`);
    expect(asOwner.status).toBe(200);
    expect(asOwner.body.id).toBe(asset.id);
  });

  it("prevents user B from reading user A's job", async () => {
    const userA = await registerUser("joba@example.com");
    const userB = await registerUser("jobb@example.com");

    const project = await prisma.project.create({ data: { userId: userA.userId, title: "t", concept: "c" } });
    const job = await prisma.job.create({ data: { projectId: project.id, type: "CONTENT_GENERATION" } });

    const asOther = await request(app).get(`/api/jobs/${job.id}`).set("Authorization", `Bearer ${userB.token}`);
    expect(asOther.status).toBe(403);

    const asOwner = await request(app).get(`/api/jobs/${job.id}`).set("Authorization", `Bearer ${userA.token}`);
    expect(asOwner.status).toBe(200);
  });
});
