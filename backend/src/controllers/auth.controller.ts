import type { Request, Response } from "express";
import { authService } from "@/services/auth/AuthService";
import { prisma } from "@/db/prisma";
import { NotFoundError } from "@/utils/errors";

export async function register(req: Request, res: Response): Promise<void> {
  const { email, password, name } = req.body;
  const result = await authService.register(email, password, name);
  res.status(201).json(result);
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;
  const result = await authService.login(email, password);
  res.status(200).json(result);
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  if (!user) throw new NotFoundError("User");
  res.status(200).json(user);
}
