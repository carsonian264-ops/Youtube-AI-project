import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "@/config/env";
import { AuthenticationError } from "@/utils/errors";

interface TokenPayload {
  sub: string;
  email: string;
}

/**
 * Verifies the Bearer JWT on the Authorization header and attaches
 * req.user. Every route that touches a user-owned resource (projects,
 * scenes, assets, jobs, youtube accounts) must be mounted behind this.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new AuthenticationError("Missing or malformed Authorization header");
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    throw new AuthenticationError("Invalid or expired token");
  }
}
