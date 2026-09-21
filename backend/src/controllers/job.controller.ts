import { requiredParam } from "@/utils/params";
import type { Request, Response } from "express";
import { prisma } from "@/db/prisma";
import { AuthorizationError, NotFoundError } from "@/utils/errors";

export async function getJob(req: Request, res: Response): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id: requiredParam(req, "id") }, include: { project: true, attempts: true } });
  if (!job) throw new NotFoundError("Job");
  if (job.project.userId !== req.user!.id) throw new AuthorizationError();
  const { project: _project, ...rest } = job;
  res.status(200).json(rest);
}
