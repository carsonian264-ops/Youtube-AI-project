import path from "node:path";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "@/config/env";
import { prisma } from "@/db/prisma";
import { redisConnection } from "@/queues/connection";
import { queues } from "@/queues/queues";
import { errorHandler, notFoundHandler } from "@/middleware/errorHandler";
import { apiRateLimiter } from "@/middleware/rateLimit";
import { authRouter } from "@/routes/auth.routes";
import { projectsRouter } from "@/routes/projects.routes";
import { scenesRouter } from "@/routes/scenes.routes";
import { assetsRouter } from "@/routes/assets.routes";
import { jobsRouter } from "@/routes/jobs.routes";
import { youtubeRouter } from "@/routes/youtube.routes";
import { usageRouter } from "@/routes/usage.routes";
import { logger } from "@/utils/logger";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(
    helmet({
      // The frontend (a different origin in dev, and typically a
      // different subdomain in production) needs to load generated
      // images/audio/video as <img>/<audio>/<video> subresources from
      // this API's /storage route (local dev) — helmet's default
      // same-origin Cross-Origin-Resource-Policy blocks that outright.
      // Production normally uses S3 storage instead, where CORS is
      // configured on the bucket (see DEPLOYMENT.md), but this stays
      // permissive for the local-storage code path either way.
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  // `credentials: true` is deliberately omitted -- auth is a Bearer JWT
  // in the Authorization header (see middleware/auth.ts), never a cookie,
  // so there's nothing for the browser to need cross-origin credentialed
  // mode for, and the flag would be misleading about the auth model.
  app.use(cors({ origin: env.FRONTEND_URL }));
  app.use(express.json({ limit: "2mb" }));
  app.use(pinoHttp({ logger, autoLogging: env.NODE_ENV !== "test" }));
  app.use(apiRateLimiter);

  // Local-dev-only static file serving for LocalStorageProvider. In
  // production (STORAGE_PROVIDER=s3) this directory does not exist and
  // is never referenced -- assets are served from the S3-compatible
  // provider's own URLs/signed URLs instead.
  if (env.STORAGE_PROVIDER === "local") {
    app.use("/storage", express.static(path.resolve(env.STORAGE_LOCAL_ROOT)));
  }

  // Pure liveness: "is the Node process up and able to handle an HTTP
  // request at all" -- deliberately checks nothing else, so a transient
  // DB/Redis hiccup doesn't make an orchestrator kill and restart a
  // backend process that's otherwise fine (that wouldn't fix the outage
  // and would just add restart-storm noise on top of it).
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Readiness: "can this instance actually serve a request right now."
  // This is the one deployment platforms should point their health check
  // at (see DEPLOYMENT.md) -- a DB or Redis outage should stop an
  // orchestrator from routing traffic here, which a liveness-only check
  // can never catch. Each dependency gets its own bounded timeout so a
  // hung connection reports "down" instead of hanging this endpoint too.
  app.get("/health/ready", async (_req, res) => {
    const withTimeout = async (label: string, check: () => Promise<unknown>): Promise<{ ok: boolean; error?: string }> => {
      try {
        await Promise.race([
          check(),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} check timed out`)), 3000)),
        ]);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "unknown error" };
      }
    };

    const [database, redis] = await Promise.all([
      withTimeout("database", () => prisma.$queryRaw`SELECT 1`),
      withTimeout("redis", () => redisConnection.ping()),
    ]);

    const allOk = database.ok && redis.ok;
    res.status(allOk ? 200 : 503).json({
      status: allOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks: { database, redis },
    });
  });

  // Operational visibility into the pipeline's 8 BullMQ queues -- a
  // backlog growing unbounded or a worker crash-looping on one queue was
  // previously invisible short of inspecting Redis directly. Deliberately
  // exposes only aggregate counts (waiting/active/completed/failed/
  // delayed per queue), never individual job payloads, error messages, or
  // any user/project-identifying data, so this is safe to leave
  // unauthenticated the same way /health is.
  app.get("/health/queues", async (_req, res) => {
    const entries = await Promise.all(
      Object.entries(queues).map(async ([name, queue]) => [name, await queue.getJobCounts()] as const),
    );
    res.status(200).json({ timestamp: new Date().toISOString(), queues: Object.fromEntries(entries) });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/scenes", scenesRouter);
  app.use("/api/assets", assetsRouter);
  app.use("/api/jobs", jobsRouter);
  app.use("/api/youtube", youtubeRouter);
  app.use("/api/usage", usageRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
