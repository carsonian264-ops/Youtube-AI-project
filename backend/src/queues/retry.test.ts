import type { Job } from "bullmq";
import { isLastAttempt } from "./retry";

function fakeJob(attemptsMade: number, attempts: number | undefined): Job {
  return { attemptsMade, opts: { attempts } } as unknown as Job;
}

describe("isLastAttempt", () => {
  it("is false on the first of three attempts", () => {
    expect(isLastAttempt(fakeJob(0, 3))).toBe(false);
  });

  it("is false on the second of three attempts", () => {
    expect(isLastAttempt(fakeJob(1, 3))).toBe(false);
  });

  it("is true on the third (final) of three attempts", () => {
    expect(isLastAttempt(fakeJob(2, 3))).toBe(true);
  });

  it("is true for a queue with attempts: 1 (e.g. publishing)", () => {
    expect(isLastAttempt(fakeJob(0, 1))).toBe(true);
  });

  it("defaults to attempts: 1 when opts.attempts is unset, so the first try is already last", () => {
    expect(isLastAttempt(fakeJob(0, undefined))).toBe(true);
  });
});
