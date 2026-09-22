import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { isAppError } from "@/utils/errors";
import { logger } from "@/utils/logger";

/**
 * Central error handler. Every route/queue-triggering handler that can
 * throw funnels here via asyncHandler(). Operational errors (AppError
 * subclasses) return their declared status code and a safe message;
 * anything unexpected is logged with full detail server-side and
 * returned to the client as an opaque 500 -- we never leak stack traces,
 * SQL, or provider error bodies to the client.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (isAppError(err)) {
    if (err.statusCode >= 500) {
      // 5xx AppErrors are almost always ProviderError, whose `details`
      // can carry a raw upstream response body (OpenArt/YouTube/etc, or
      // whatever their error page happened to say) -- useful for
      // debugging, not something to forward verbatim to an API
      // consumer. Full detail goes to the log; the client gets the
      // message only ("safe error messages", spec section 18).
      logger.error({ err, path: req.path }, err.message);
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    logger.warn({ code: err.code, path: req.path }, err.message);
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: err.flatten() },
    });
    return;
  }

  logger.error({ err, path: req.path }, "Unhandled error");
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` } });
}
