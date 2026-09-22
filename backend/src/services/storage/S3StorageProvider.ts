import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl as presign } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider, UploadInput, UploadResult } from "./StorageProvider";

export interface S3StorageProviderOptions {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
}

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
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.data,
        ContentType: input.contentType,
      }),
    );

    const url = this.publicBaseUrl ? `${this.publicBaseUrl}/${input.key}` : await this.getSignedUrl(input.key);

    return { key: input.key, url, sizeBytes: input.data.byteLength };
  }

  async resolveLocalPath(key: string): Promise<string> {
    // FFmpeg needs a local file handle; download the object to a temp
    // file on demand rather than requiring every asset to also live on
    // local disk.
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) {
      throw new Error(`S3 object not found or empty: ${key}`);
    }
    const tmpPath = path.join(os.tmpdir(), `s3-${Date.now()}-${path.basename(key)}`);
    await fs.writeFile(tmpPath, Buffer.from(bytes));
    return tmpPath;
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return presign(this.client, command, { expiresIn: expiresInSeconds });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
