export type PublishVisibility = "PRIVATE" | "UNLISTED" | "PUBLIC";

export interface PublishVideoInput {
  accessToken: string;
  refreshToken: string;
  videoFilePath: string;
  thumbnailFilePath?: string;
  title: string;
  description: string;
  tags: string[];
  visibility: PublishVisibility;
}

export interface PublishResult {
  externalVideoId: string;
  url?: string;
}

/**
 * Abstraction over "upload the final video to a publishing destination".
 * The application NEVER calls this automatically -- every publish action
 * originates from an explicit, user-confirmed request (see
 * publishing.routes.ts / PublishingJob.confirmedByUser). Only YouTube is
 * implemented today; the interface is deliberately destination-agnostic
 * so another platform could be added later.
 */
export interface PublishingProvider {
  publish(input: PublishVideoInput): Promise<PublishResult>;
}
