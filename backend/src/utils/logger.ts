import pino from "pino";
import { env } from "@/config/env";

const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "*.password",
  "*.passwordHash",
  "*.apiKey",
  "*.accessToken",
  "*.refreshToken",
  "*.accessTokenEnc",
  "*.refreshTokenEnc",
  "*.secret",
  "*.token",
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  base: { service: "ai-content-studio-backend" },
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
