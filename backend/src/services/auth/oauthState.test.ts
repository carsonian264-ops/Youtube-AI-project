import jwt from "jsonwebtoken";
import { env } from "@/config/env";
import { signOAuthState, verifyOAuthState } from "./oauthState";

describe("OAuth state signing (CSRF / account-linking protection)", () => {
  it("round-trips a signed state back to the original user id", () => {
    const state = signOAuthState("user-123");
    expect(verifyOAuthState(state)).toBe("user-123");
  });

  it("rejects a state value that was never signed by this server", () => {
    // Simulates an attacker crafting a callback URL with an arbitrary
    // state value instead of one this server issued.
    expect(() => verifyOAuthState("attacker-controlled-user-id")).toThrow();
    expect(() => verifyOAuthState("victim-user-id")).toThrow();
  });

  it("rejects a state token signed with a different secret", () => {
    // Simulates an attacker who doesn't know JWT_SECRET trying to forge
    // a token for an arbitrary victim user id.
    const forged = jwt.sign({ userId: "victim-user-id", purpose: "youtube-oauth" }, "wrong-secret-attacker-guessed");
    expect(() => verifyOAuthState(forged)).toThrow();
  });

  it("rejects a token whose purpose claim doesn't match (can't repurpose another signed token)", () => {
    const wrongPurpose = jwt.sign({ userId: "user-123", purpose: "something-else" }, env.JWT_SECRET);
    expect(() => verifyOAuthState(wrongPurpose)).toThrow();
  });

  it("rejects an expired state token", () => {
    const expired = jwt.sign({ userId: "user-123", purpose: "youtube-oauth" }, env.JWT_SECRET, { expiresIn: -1 });
    expect(() => verifyOAuthState(expired)).toThrow();
  });

  it("rejects missing or non-string state", () => {
    expect(() => verifyOAuthState(undefined)).toThrow();
    expect(() => verifyOAuthState("")).toThrow();
    expect(() => verifyOAuthState(["array-not-string"])).toThrow();
  });
});
