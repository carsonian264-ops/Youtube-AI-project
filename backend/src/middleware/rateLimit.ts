import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { env } from "@/config/env";

// Integration tests routinely register/login far more than a real client
// would within a rate-limit window (each test spins up its own user);
// rate limiting is a production/dev concern, not something the test
// suite should have to work around with artificial delays.
const passthrough = (_req: Request, _res: Response, next: NextFunction) => next();

/**
 * Global API rate limiter. Keyed by IP by default; authenticated routes
 * additionally benefit from per-user throttling being straightforward to
 * add later (req.user.id) without changing this module's shape.
 */
export const apiRateLimiter =
  env.NODE_ENV === "test"
    ? passthrough
    : rateLimit({
        windowMs: env.RATE_LIMIT_WINDOW_MS,
        max: env.RATE_LIMIT_MAX_REQUESTS,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests, please try again later." } },
      });

export const authRateLimiter =
  env.NODE_ENV === "test"
    ? passthrough
    : rateLimit({
        windowMs: env.RATE_LIMIT_WINDOW_MS,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many authentication attempts, please try again later." } },
      });
