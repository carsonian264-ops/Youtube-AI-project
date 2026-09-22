import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl as presign } from "@aws-sdk/s3-request-presigner";
import { ProviderError } from "@/utils/errors";
import type { StorageProvider, UploadInput, UploadResult } from "./StorageProvider";

export interface S3StorageProviderOptions {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
}

const TMP_PREFIX = "s3-";
const TMP_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Production storage adapter. Works with Amazon S3 directly, or with any
 * S3-compatible provider (Cloudflare R2, Supabase Storage, MinIO, etc.)
 * by setting STORAGE_ENDPOINT. Uses path-style addressing so R2/Supabase
 * endpoints work without extra configuration.
 */
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl?: string;

  constructor(options: S3StorageProviderOptions) {
    this.bucket = options.bucket;
    this.publicBaseUrl = options.publicBaseUrl;
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: Boolean(options.endpoint),
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.key,
          Body: input.data,
          ContentType: input.contentType,
        }),
      );
    } catch (err) {
      throw this.wrap(err, `Failed to upload ${input.key}`);
    }

    const url = this.publicBaseUrl ? `${this.publicBaseUrl}/${input.key}` : await this.getSignedUrl(input.key);

    return { key: input.key, url, sizeBytes: input.data.byteLength };
  }

  async resolveLocalPath(key: string): Promise<string> {
    // FFmpeg needs a local file handle; download the object to a temp
    // file on demand rather than requiring every asset to also live on
    // local disk. Nothing downstream (FFmpegRenderer, the publishing
    // provider) knows to delete this afterwards, so on every call we
    // also sweep our own previously-downloaded temp files older than
    // TMP_MAX_AGE_MS -- bounding the leak instead of requiring every
    // caller to coordinate cleanup.
    await this.cleanupStaleTempFiles();

    let bytes: Uint8Array | undefined;
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      bytes = await res.Body?.transformToByteArray();
    } catch (err) {
      throw this.wrap(err, `Failed to download ${key}`);
    }
    if (!bytes) {
      throw new ProviderError("s3", `Object not found or empty: ${key}`, false);
    }
    const tmpPath = path.join(os.tmpdir(), `${TMP_PREFIX}${randomUUID()}-${path.basename(key)}`);
    await fs.writeFile(tmpPath, Buffer.from(bytes));
    return tmpPath;
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
      return await presign(this.client, command, { expiresIn: expiresInSeconds });
    } catch (err) {
      throw this.wrap(err, `Failed to sign a URL for ${key}`);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      throw this.wrap(err, `Failed to delete ${key}`);
    }
  }

  private wrap(err: unknown, message: string): ProviderError {
    const detail = err instanceof Error ? err.message : String(err);
    return new ProviderError("s3", `${message}: ${detail}`, true);
  }

  private async cleanupStaleTempFiles(): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(os.tmpdir());
    } catch {
      return;
    }
    const now = Date.now();
    await Promise.all(
      entries
        .filter((name) => name.startsWith(TMP_PREFIX))
        .map(async (name) => {
          const filePath = path.join(os.tmpdir(), name);
          try {
            const stat = await fs.stat(filePath);
            if (now - stat.mtimeMs > TMP_MAX_AGE_MS) {
              await fs.rm(filePath, { force: true });
            }
          } catch {
            // Lost a race with another cleanup/download; ignore.
          }
        }),
    );
  }
}
