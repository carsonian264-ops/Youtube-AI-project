import { MockPublishingProvider } from "./MockPublishingProvider";

describe("MockPublishingProvider", () => {
  const provider = new MockPublishingProvider();

  it("publishes and returns a mock video id and url", async () => {
    const result = await provider.publish({
      accessToken: "token",
      refreshToken: "refresh",
      videoFilePath: "/tmp/video.mp4",
      title: "My video",
      description: "desc",
      tags: [],
      visibility: "PRIVATE",
    });
    expect(result.externalVideoId).toMatch(/^mock-/);
    expect(result.url).toContain(result.externalVideoId);
  });

  it("returns the same stats for the same video id every time (no flicker on refresh)", async () => {
    const input = { accessToken: "a", refreshToken: "b", externalVideoId: "mock-fixed-id" };
    const first = await provider.getStats(input);
    const second = await provider.getStats(input);
    expect(second).toEqual(first);
  });

  it("returns different stats for different video ids", async () => {
    const a = await provider.getStats({ accessToken: "a", refreshToken: "b", externalVideoId: "mock-video-a" });
    const b = await provider.getStats({ accessToken: "a", refreshToken: "b", externalVideoId: "mock-video-b" });
    expect(a).not.toEqual(b);
  });

  it("keeps likes and comments proportionate to and no larger than views", async () => {
    const stats = await provider.getStats({ accessToken: "a", refreshToken: "b", externalVideoId: "mock-video-c" });
    expect(stats.viewCount).toBeGreaterThan(0);
    expect(stats.likeCount).toBeLessThan(stats.viewCount);
    expect(stats.commentCount).toBeLessThan(stats.viewCount);
  });
});
