import { randomUUID } from "node:crypto";
import type { GetVideoStatsInput, PublishingProvider, PublishResult, PublishVideoInput, VideoStats } from "./PublishingProvider";

/** Deterministic hash so a given mock video always reports the same stats instead of jittering on every refresh. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Zero-network implementation used for local development
 * (PUBLISHING_PROVIDER=mock, the default) and tests. Simulates a
 * successful upload without contacting YouTube, so the review/confirm/
 * publish UX can be built and tested before Google OAuth credentials
 * exist.
 */
export class MockPublishingProvider implements PublishingProvider {
  async publish(input: PublishVideoInput): Promise<PublishResult> {
    const externalVideoId = `mock-${randomUUID()}`;
    return {
      externalVideoId,
      url: `https://example.invalid/mock-youtube/${externalVideoId}?title=${encodeURIComponent(input.title)}`,
    };
  }

  async getStats(input: GetVideoStatsInput): Promise<VideoStats> {
    const seed = hashString(input.externalVideoId);
    const viewCount = 50 + (seed % 5000);
    const likeCount = Math.round(viewCount * 0.08);
    const commentCount = Math.round(viewCount * 0.01);
    return { viewCount, likeCount, commentCount };
  }
}
