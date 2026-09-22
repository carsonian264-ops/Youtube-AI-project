import jwt from "jsonwebtoken";
import { env } from "@/config/env";
import { AuthenticationError } from "@/utils/errors";

interface OAuthStatePayload {
  userId: string;
  purpose: "youtube-oauth";
}

/**
 * Google's OAuth `state` parameter round-trips through the user's
 * browser on an unauthenticated top-level redirect (no Authorization
 * header survives that hop), but it is also attacker-controllable:
 * anyone can send a victim a crafted
 * `/oauth/callback?code=...&state=...` link. Without binding `state` to
 * the user who started the flow, an attacker could link their own
 * YouTube account to a victim's app account (classic OAuth CSRF /
 * account-linking attack, RFC 6749 §10.12) by swapping in the victim's
 * user id. Signing it closes that off: only this server can produce a
 * state value that verifies, so a forged one is rejected.
 */
export function signOAuthState(userId: string): string {
  return jwt.sign({ userId, purpose: "youtube-oauth" } satisfies OAuthStatePayload, env.JWT_SECRET, { expiresIn: "10m" });
}

export function verifyOAuthState(state: unknown): string {
  if (typeof state !== "string" || !state) {
    throw new AuthenticationError("Missing or invalid OAuth state");
  }
  let payload: OAuthStatePayload;
  try {
    payload = jwt.verify(state, env.JWT_SECRET) as OAuthStatePayload;
  } catch {
    throw new AuthenticationError("OAuth state is invalid or expired; please reconnect from Settings");
  }
  if (payload.purpose !== "youtube-oauth" || !payload.userId) {
    throw new AuthenticationError("Invalid OAuth state");
  }
  return payload.userId;
}
