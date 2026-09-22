export interface UploadInput {
  /** Storage key/path, e.g. "projects/{projectId}/scenes/{sceneId}/image.png" */
  key: string;
  data: Buffer;
  contentType: string;
}

export interface UploadResult {
  key: string;
  /** Publicly (or signed-URL) accessible URL, when immediately known. */
  url: string;
  sizeBytes: number;
}

/**
 * Abstraction over "where generated media files live". Every other part
 * of the app (asset service, video renderer, publishing) works purely in
 * terms of storage keys and this interface -- switching from local disk
 * to S3/R2/Supabase in production is a one-line env var change
 * (STORAGE_PROVIDER), not a code change.
 */
export interface StorageProvider {
  upload(input: UploadInput): Promise<UploadResult>;
  /** Resolve a storage key to a locally-readable file path, downloading if necessary (used by FFmpeg). */
  resolveLocalPath(key: string): Promise<string>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}
