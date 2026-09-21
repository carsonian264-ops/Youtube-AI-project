import type { Request, Response } from "express";
import { usageService } from "@/services/usage/UsageService";

export async function getUsageSummary(req: Request, res: Response): Promise<void> {
  const summary = await usageService.summarizeForUser(req.user!.id);
  res.status(200).json(summary);
}
