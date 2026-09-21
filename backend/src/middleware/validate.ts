import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { ValidationError } from "@/utils/errors";

type ValidationTarget = "body" | "params" | "query";

/**
 * Validates req[target] against a Zod schema and replaces it with the
 * parsed (and defaulted/coerced) value. Every mutating route in this
 * application validates its input this way -- nothing reaches a
 * controller or the database unvalidated.
 */
export function validate(schema: ZodType, target: ValidationTarget = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      throw new ValidationError("Request validation failed", result.error.flatten());
    }
    (req as unknown as Record<ValidationTarget, unknown>)[target] = result.data;
    next();
  };
}
