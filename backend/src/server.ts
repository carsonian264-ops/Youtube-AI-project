import { createApp } from "./app";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "API server listening");
});

function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down API server...");
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
