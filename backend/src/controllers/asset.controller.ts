import { requiredParam } from "@/utils/params";
import type { Request, Response } from "express";
import { prisma } from "@/db/prisma";
import { AuthorizationError, NotFoundError } from "@/utils/errors";

export async function getAsset(req: Request, res: Response): Promise<void> {
  const asset = await prisma.asset.findUnique({ where: { id: requiredParam(req, "id") }, include: { project: true } });
  if (!asset) throw new NotFoundError("Asset");
  if (asset.project.userId !== req.user!.id) throw new AuthorizationError();
  const { project: _project, ...rest } = asset;
  res.status(200).json(rest);
}
