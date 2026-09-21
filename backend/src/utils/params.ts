import type { Request } from "express";

/**
 * Route params typed as `{ [key: string]: string }` are `string | undefined`
 * under noUncheckedIndexedAccess even after validate(Schema, "params") has
 * already guaranteed the value is present at runtime (Zod would have
 * rejected the request otherwise). This narrows without re-validating.
 */
export function requiredParam(req: Request, key: string): string {
  const value = req.params[key];
  if (!value) {
    throw new Error(`Expected route param "${key}" to be present (was request validated?)`);
  }
  return value;
}
