import { prisma } from "@/db/prisma";

/**
 * Deletes all rows from every table between tests, in FK-safe order
 * (children before parents). Runs against the real
 * "ai_content_studio_test" Postgres database (see setupEnv.ts) -- these
 * tests exercise Prisma/Postgres for real rather than mocking the ORM.
 */
export async function resetDatabase(): Promise<void> {
  await prisma.jobAttempt.deleteMany();
  await prisma.job.deleteMany();
  await prisma.publishingJob.deleteMany();
  await prisma.youtubeAccount.deleteMany();
  await prisma.usageRecord.deleteMany();
  await prisma.assetVersion.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.caption.deleteMany();
  await prisma.thumbnail.deleteMany();
  await prisma.video.deleteMany();
  await prisma.character.deleteMany();
  await prisma.scene.deleteMany();
  await prisma.script.deleteMany();
  await prisma.projectVersion.deleteMany();
  await prisma.project.deleteMany();
  await prisma.systemLog.deleteMany();
  await prisma.user.deleteMany();
}
