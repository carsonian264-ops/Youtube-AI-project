import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/config/env";
import type { StorageProvider, UploadInput, UploadResult } from "./StorageProvider";

/**
 * Development-only storage adapter: writes files to disk under
 * STORAGE_LOCAL_ROOT and serves them from the backend at /storage/<key>
 * (see server.ts static mount). Never used in production -- see
 * S3StorageProvider for the cloud-ready implementation.
 */
export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor(root: string = env.STORAGE_LOCAL_ROOT) {
    this.root = path.resolve(root);
  }

  private absolutePath(key: string): string {
    const resolved = path.resolve(this.root, key);
    // A bare `startsWith(this.root)` would wrongly accept a sibling
    // directory that merely shares the root as a string prefix (e.g.
    // root "/data/storage" would pass for "/data/storage-evil/x", since
    // that string does start with "/data/storage"). Requiring the root
    // boundary to be followed by a path separator (or be an exact
    // match) closes that off. Keys are always server-generated today
    // (see AssetService), never taken from user input, so this isn't
    // reachable yet -- but it's the correct check regardless of what
    // calls this later.
    if (resolved !== this.root && !resolved.startsWith(this.root + path.sep)) {
      throw new Error(`Refusing to write outside storage root: ${key}`);
    }
    return resolved;
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    const filePath = this.absolutePath(input.key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, input.data);
    return {
      key: input.key,
      url: `${env.BACKEND_URL}/storage/${input.key}`,
      sizeBytes: input.data.byteLength,
    };
  }

  async resolveLocalPath(key: string): Promise<string> {
    return this.absolutePath(key);
  }

  async getSignedUrl(key: string): Promise<string> {
    // Local dev has no concept of a signed URL; files are served directly.
    return `${env.BACKEND_URL}/storage/${key}`;
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.absolutePath(key), { force: true });
  }
}
