import { prisma } from "@/db/prisma";
import type { Prisma, UsageType } from "@/generated/prisma";

export interface RecordUsageInput {
  userId: string;
  projectId?: string;
  jobId?: string;
  type: UsageType;
  quantity: number;
  unit: string;
  metadata?: Record<string, unknown>;
}

/**
 * Foundation for future SaaS billing: every metered operation (an AI
 * call, an image/voice generation, render time, a YouTube upload) writes
 * one UsageRecord. This does NOT implement billing -- it only builds the
 * ledger a billing provider (e.g. Stripe metered usage) would read from
 * later.
 */
export class UsageService {
  async record(input: RecordUsageInput): Promise<void> {
    await prisma.usageRecord.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        type: input.type,
        quantity: input.quantity,
        unit: input.unit,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async summarizeForUser(userId: string) {
    const records = await prisma.usageRecord.groupBy({
      by: ["type"],
      where: { userId },
      _sum: { quantity: true },
    });
    return records.map((r) => ({ type: r.type, total: r._sum.quantity ?? 0 }));
  }
}

export const usageService = new UsageService();
