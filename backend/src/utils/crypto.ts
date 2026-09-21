import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "@/config/env";

const ALGORITHM = "aes-256-gcm";
const KEY = scryptSync(env.SESSION_SECRET, "youtube-oauth-token-store", 32);

/**
 * Encrypts OAuth tokens (YouTube access/refresh tokens) before they are
 * persisted. Derives its key from SESSION_SECRET via scrypt rather than
 * requiring a dedicated ENCRYPTION_KEY env var, so no new secret needs to
 * be provisioned. Never used for passwords (those are hashed with
 * bcrypt, one-way, in AuthService).
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf-8");
}
