import { randomUUID } from "node:crypto";
import { prisma } from "@/db/prisma";
import type { Asset, AssetType, Prisma } from "@/generated/prisma";
import { createStorageProvider } from "@/services/providers";
import { usageService } from "@/services/usage/UsageService";

export interface RecordAssetInput {
  projectId: string;
  sceneId?: string;
  userId: string;
  type: AssetType;
  provider: string;
  data: Buffer;
  mimeType: string;
  extension: string;
  metadata?: Record<string, unknown>;
}

/**
 * Bridges "raw bytes from a generation provider" to "a durable Asset row
 * pointing at object storage". Every generated image/audio/video/caption
 * file passes through here exactly once, so storage keys and Asset
 * metadata are always created consistently regardless of which worker
 * produced the bytes.
 */
export class AssetService {
  async recordAsset(input: RecordAssetInput): Promise<Asset> {
    const storage = createStorageProvider();
    const key = `projects/${input.projectId}/${input.type.toLowerCase()}/${randomUUID()}.${input.extension}`;
    const uploaded = await storage.upload({ key, data: input.data, contentType: input.mimeType });

    const asset = await prisma.asset.create({
      data: {
        projectId: input.projectId,
        sceneId: input.sceneId,
        type: input.type,
        provider: input.provider,
        storageKey: uploaded.key,
        url: uploaded.url,
        mimeType: input.mimeType,
        fileSizeBytes: uploaded.sizeBytes,
        status: "READY",
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    await usageService.record({
      userId: input.userId,
      projectId: input.projectId,
      type: this.usageTypeFor(input.type),
      quantity: 1,
      unit: "generation",
      metadata: { provider: input.provider, assetId: asset.id },
    });

    return asset;
  }

  async latestReadyForScene(sceneId: string, type: AssetType): Promise<Asset | null> {
    return prisma.asset.findFirst({
      where: { sceneId, type, status: "READY" },
      orderBy: { createdAt: "desc" },
    });
  }

  private usageTypeFor(type: AssetType) {
    switch (type) {
      case "IMAGE":
      case "VIDEO":
        return "IMAGE_GENERATION" as const;
      case "AUDIO":
        return "VOICE_GENERATION" as const;
      default:
        return "STORAGE_BYTES" as const;
    }
  }
}

export const assetService = new AssetService();
