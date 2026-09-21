import path from "node:path";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "@/config/env";
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
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    }),
  );
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

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
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
