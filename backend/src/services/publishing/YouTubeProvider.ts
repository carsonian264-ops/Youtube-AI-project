import { createReadStream } from "node:fs";
import { google } from "googleapis";
import { ProviderError } from "@/utils/errors";
import type {
  GetVideoStatsInput,
  PublishingProvider,
  PublishResult,
  PublishVideoInput,
  PublishVisibility,
  VideoStats,
} from "./PublishingProvider";

const VISIBILITY_MAP: Record<PublishVisibility, string> = {
  PRIVATE: "private",
  UNLISTED: "unlisted",
  PUBLIC: "public",
};

export interface YouTubeProviderOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Real YouTube Data API v3 implementation, using OAuth2 tokens obtained
 * through the Google OAuth consent flow (see auth.routes.ts /
 * YoutubeAccount model). We never ask a user for their YouTube password --
 * only the OAuth access/refresh token pair, which is stored encrypted.
 */
export class YouTubeProvider implements PublishingProvider {
  constructor(private readonly options: YouTubeProviderOptions) {}

  private buildClient(accessToken: string, refreshToken: string) {
    const oauth2Client = new google.auth.OAuth2(this.options.clientId, this.options.clientSecret, this.options.redirectUri);
    oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
    return google.youtube({ version: "v3", auth: oauth2Client });
  }

  async publish(input: PublishVideoInput): Promise<PublishResult> {
    const youtube = this.buildClient(input.accessToken, input.refreshToken);

    try {
      const insertRes = await youtube.videos.insert({
        part: ["snippet", "status"],
        requestBody: {
          snippet: {
            title: input.title,
            description: input.description,
            tags: input.tags,
          },
          status: {
            privacyStatus: VISIBILITY_MAP[input.visibility],
            selfDeclaredMadeForKids: false,
          },
        },
        media: {
          body: createReadStream(input.videoFilePath),
        },
      });

      const videoId = insertRes.data.id;
      if (!videoId) {
        throw new ProviderError("youtube", "Upload succeeded but response did not include a video id", false);
      }

      if (input.thumbnailFilePath) {
        await youtube.thumbnails.set({
          videoId,
          media: { body: createReadStream(input.thumbnailFilePath) },
        });
      }

      return { externalVideoId: videoId, url: `https://www.youtube.com/watch?v=${videoId}` };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      const message = err instanceof Error ? err.message : "Unknown YouTube API error";
      throw new ProviderError("youtube", message, true);
    }
  }

  async getStats(input: GetVideoStatsInput): Promise<VideoStats> {
    const youtube = this.buildClient(input.accessToken, input.refreshToken);

    try {
      const res = await youtube.videos.list({ part: ["statistics"], id: [input.externalVideoId] });
      const stats = res.data.items?.[0]?.statistics;
      if (!stats) {
        throw new ProviderError("youtube", "YouTube did not return statistics for this video", false);
      }

      return {
        viewCount: Number(stats.viewCount ?? 0),
        likeCount: Number(stats.likeCount ?? 0),
        commentCount: Number(stats.commentCount ?? 0),
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      const message = err instanceof Error ? err.message : "Unknown YouTube API error";
      throw new ProviderError("youtube", message, true);
    }
  }
}
