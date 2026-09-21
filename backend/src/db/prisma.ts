// Relative (not aliased) on purpose: the generated client ships as plain
// .js/.d.ts with no .ts source, so tsc-alias has nothing to rewrite this
// import against at build time -- see backend/package.json's build script
// for the step that copies src/generated into dist/generated.
import { PrismaClient } from "../generated/prisma";
import { env } from "@/config/env";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Reuse a single PrismaClient instance across hot reloads in dev so we
 * don't exhaust Postgres connections.
 */
export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
