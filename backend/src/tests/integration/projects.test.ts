import request from "supertest";
import { prisma } from "@/db/prisma";
import { redisConnection } from "@/queues/connection";
import { resetDatabase } from "@/tests/testDb";

jest.mock("@/queues/enqueue", () => ({
  enqueueJob: jest.fn().mockResolvedValue({ id: "mock-job-id" }),
}));

// Imported after the mock so the router picks up the mocked enqueueJob.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { createApp } from "@/app";

const app = createApp();

async function registerUser(email: string) {
  const res = await request(app).post("/api/auth/register").send({ email, password: "supersecret123" });
  return { token: res.body.token as string, userId: res.body.user.id as string };
}

describe("Projects API", () => {
  afterEach(async () => {
    await resetDatabase();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await redisConnection.quit();
  });

  describe("POST /api/projects", () => {
    it("requires authentication", async () => {
      const res = await request(app).post("/api/projects").send({ title: "t", concept: "c" });
      expect(res.status).toBe(401);
    });

    it("creates a project owned by the authenticated user, defaulting to DRAFT", async () => {
      const { token, userId } = await registerUser("owner@example.com");
      const res = await request(app)
        .post("/api/projects")
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "My video", concept: "An idea", estimatedDurationSeconds: 60 });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("DRAFT");
      expect(res.body.userId).toBe(userId);
    });

    it("rejects a project without a concept", async () => {
      const { token } = await registerUser("invalid@example.com");
      const res = await request(app).post("/api/projects").set("Authorization", `Bearer ${token}`).send({ title: "t" });
      expect(res.status).toBe(400);
    });
  });

  describe("ownership isolation", () => {
    it("prevents user B from reading user A's project by guessing the ID", async () => {
      const userA = await registerUser("usera@example.com");
      const userB = await registerUser("userb@example.com");

      const created = await request(app)
        .post("/api/projects")
        .set("Authorization", `Bearer ${userA.token}`)
        .send({ title: "Private", concept: "Secret idea" });
      const projectId = created.body.id;

      const asOwner = await request(app).get(`/api/projects/${projectId}`).set("Authorization", `Bearer ${userA.token}`);
      expect(asOwner.status).toBe(200);

      const asOther = await request(app).get(`/api/projects/${projectId}`).set("Authorization", `Bearer ${userB.token}`);
      expect(asOther.status).toBe(403);
    });

    it("prevents user B from updating or deleting user A's project", async () => {
      const userA = await registerUser("usera2@example.com");
      const userB = await registerUser("userb2@example.com");

      const created = await request(app)
        .post("/api/projects")
        .set("Authorization", `Bearer ${userA.token}`)
        .send({ title: "Private", concept: "Secret idea" });
      const projectId = created.body.id;

      const update = await request(app)
        .patch(`/api/projects/${projectId}`)
        .set("Authorization", `Bearer ${userB.token}`)
        .send({ title: "Hijacked" });
      expect(update.status).toBe(403);

      const del = await request(app).delete(`/api/projects/${projectId}`).set("Authorization", `Bearer ${userB.token}`);
      expect(del.status).toBe(403);

      const stillThere = await prisma.project.findUnique({ where: { id: projectId } });
      expect(stillThere?.title).toBe("Private");
    });

    it("only lists the authenticated user's own projects", async () => {
      const userA = await registerUser("lista@example.com");
      const userB = await registerUser("listb@example.com");

      await request(app).post("/api/projects").set("Authorization", `Bearer ${userA.token}`).send({ title: "A1", concept: "c" });
      await request(app).post("/api/projects").set("Authorization", `Bearer ${userA.token}`).send({ title: "A2", concept: "c" });
      await request(app).post("/api/projects").set("Authorization", `Bearer ${userB.token}`).send({ title: "B1", concept: "c" });

      const res = await request(app).get("/api/projects").set("Authorization", `Bearer ${userA.token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body.every((p: { title: string }) => p.title.startsWith("A"))).toBe(true);
    });

    it("returns 404 (not 403) for a project id that does not exist at all", async () => {
      const { token } = await registerUser("nores@example.com");
      const res = await request(app)
        .get("/api/projects/00000000-0000-0000-0000-000000000000")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/projects/:id/generate", () => {
    it("moves a DRAFT project to PLANNING and enqueues a content-generation job", async () => {
      const { token } = await registerUser("gen@example.com");
      const created = await request(app)
        .post("/api/projects")
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "t", concept: "c" });

      const res = await request(app).post(`/api/projects/${created.body.id}/generate`).set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(202);
      expect(res.body.status).toBe("PLANNING");

      const project = await prisma.project.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(project.status).toBe("PLANNING");
    });

    it("refuses to regenerate a project that is already mid-pipeline", async () => {
      const { token } = await registerUser("gen2@example.com");
      const created = await request(app)
        .post("/api/projects")
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "t", concept: "c" });

      await request(app).post(`/api/projects/${created.body.id}/generate`).set("Authorization", `Bearer ${token}`);
      const second = await request(app).post(`/api/projects/${created.body.id}/generate`).set("Authorization", `Bearer ${token}`);
      expect(second.status).toBe(409);
    });
  });

  describe("POST /api/projects/:id/thumbnails/:thumbnailId/select", () => {
    async function createProjectWithThumbnails(token: string) {
      const created = await request(app)
        .post("/api/projects")
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "t", concept: "c" });
      const projectId = created.body.id as string;

      const [first, second, third] = await Promise.all([
        prisma.thumbnail.create({ data: { projectId, storageKey: "a", isSelected: true } }),
        prisma.thumbnail.create({ data: { projectId, storageKey: "b", isSelected: false } }),
        prisma.thumbnail.create({ data: { projectId, storageKey: "c", isSelected: false } }),
      ]);
      return { projectId, first, second, third };
    }

    it("selects exactly one thumbnail, deselecting the others", async () => {
      const { token } = await registerUser("thumbs@example.com");
      const { projectId, second } = await createProjectWithThumbnails(token);

      const res = await request(app)
        .post(`/api/projects/${projectId}/thumbnails/${second.id}/select`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(204);

      const thumbnails = await prisma.thumbnail.findMany({ where: { projectId }, orderBy: { storageKey: "asc" } });
      expect(thumbnails.map((t) => ({ key: t.storageKey, selected: t.isSelected }))).toEqual([
        { key: "a", selected: false },
        { key: "b", selected: true },
        { key: "c", selected: false },
      ]);
    });

    it("404s for a thumbnail that belongs to a different project", async () => {
      const { token } = await registerUser("thumbs2@example.com");
      const { projectId: projectA } = await createProjectWithThumbnails(token);
      const { third: thumbFromB } = await createProjectWithThumbnails(token);

      const res = await request(app)
        .post(`/api/projects/${projectA}/thumbnails/${thumbFromB.id}/select`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it("403s when a different user tries to select a thumbnail on someone else's project", async () => {
      const userA = await registerUser("thumbs-owner@example.com");
      const userB = await registerUser("thumbs-other@example.com");
      const { projectId, second } = await createProjectWithThumbnails(userA.token);

      const res = await request(app)
        .post(`/api/projects/${projectId}/thumbnails/${second.id}/select`)
        .set("Authorization", `Bearer ${userB.token}`);
      expect(res.status).toBe(403);

      const unchanged = await prisma.thumbnail.findUniqueOrThrow({ where: { id: second.id } });
      expect(unchanged.isSelected).toBe(false);
    });
  });
});
