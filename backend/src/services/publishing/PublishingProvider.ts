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

export interface GetVideoStatsInput {
  accessToken: string;
  refreshToken: string;
  externalVideoId: string;
}

export interface VideoStats {
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

/**
 * Abstraction over "upload the final video to a publishing destination"
 * and "read back post-publish stats for it". The application NEVER
 * publishes automatically -- every publish action originates from an
 * explicit, user-confirmed request (see publishing.routes.ts /
 * PublishingJob.confirmedByUser). Only YouTube is implemented today; the
 * interface is deliberately destination-agnostic so another platform
 * could be added later.
 */
export interface PublishingProvider {
  publish(input: PublishVideoInput): Promise<PublishResult>;
  getStats(input: GetVideoStatsInput): Promise<VideoStats>;
}
