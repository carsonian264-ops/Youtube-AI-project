import request from "supertest";
import { createApp } from "@/app";
import { prisma } from "@/db/prisma";
import { redisConnection } from "@/queues/connection";
import { resetDatabase } from "@/tests/testDb";

const app = createApp();

describe("Auth API", () => {
  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await redisConnection.quit();
  });

  describe("POST /api/auth/register", () => {
    it("registers a new user and returns a token", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: "alice@example.com", password: "supersecret123", name: "Alice" });

      expect(res.status).toBe(201);
      expect(res.body.user.email).toBe("alice@example.com");
      expect(typeof res.body.token).toBe("string");
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it("rejects a password shorter than 8 characters", async () => {
      const res = await request(app).post("/api/auth/register").send({ email: "bob@example.com", password: "short" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects registering the same email twice", async () => {
      await request(app).post("/api/auth/register").send({ email: "dup@example.com", password: "supersecret123" });
      const res = await request(app).post("/api/auth/register").send({ email: "dup@example.com", password: "supersecret123" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
    });
  });

  describe("POST /api/auth/login", () => {
    it("logs in with correct credentials", async () => {
      await request(app).post("/api/auth/register").send({ email: "carol@example.com", password: "supersecret123" });
      const res = await request(app).post("/api/auth/login").send({ email: "carol@example.com", password: "supersecret123" });
      expect(res.status).toBe(200);
      expect(typeof res.body.token).toBe("string");
    });

    it("rejects an incorrect password without revealing whether the email exists", async () => {
      await request(app).post("/api/auth/register").send({ email: "dave@example.com", password: "supersecret123" });
      const wrongPassword = await request(app).post("/api/auth/login").send({ email: "dave@example.com", password: "wrongpassword" });
      const unknownEmail = await request(app).post("/api/auth/login").send({ email: "nobody@example.com", password: "wrongpassword" });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
    });
  });

  describe("GET /api/auth/me", () => {
    it("requires authentication", async () => {
      const res = await request(app).get("/api/auth/me");
      expect(res.status).toBe(401);
    });

    it("returns the authenticated user's profile", async () => {
      const register = await request(app).post("/api/auth/register").send({ email: "erin@example.com", password: "supersecret123" });
      const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${register.body.token}`);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe("erin@example.com");
    });

    it("rejects a malformed token", async () => {
      const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer not-a-real-token");
      expect(res.status).toBe(401);
    });
  });
});
