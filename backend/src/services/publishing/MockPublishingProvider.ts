import { randomUUID } from "node:crypto";
import type { PublishingProvider, PublishResult, PublishVideoInput } from "./PublishingProvider";

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
}
