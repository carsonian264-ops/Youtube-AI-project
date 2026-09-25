import { GeminiProvider } from "./GeminiProvider";
import { ProviderError } from "@/utils/errors";

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe("GeminiProvider error classification", () => {
  const provider = new GeminiProvider({ apiKey: "test-key", model: "gemini-test" });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("marks a 503 (server overloaded) response as retryable", async () => {
    mockFetchOnce(503, { error: { message: "high demand" } });

    await expect(provider.generateProjectPlan({ idea: "topic" })).rejects.toMatchObject({
      retryable: true,
    });
  });

  it("marks a 429 (free-tier quota exhausted) response as retryable", async () => {
    // This is the exact failure hit in real use: Google's free tier
    // caps requests per day per model and returns 429 RESOURCE_EXHAUSTED
    // once that's used up -- an immediate retry can't fix that, but
    // falling back to another provider (FallbackAIContentProvider) can,
    // so this must be marked retryable the same as a 5xx.
    mockFetchOnce(429, { error: { message: "quota exceeded", status: "RESOURCE_EXHAUSTED" } });

    await expect(provider.generateProjectPlan({ idea: "topic" })).rejects.toMatchObject({
      retryable: true,
    });
  });

  it("does NOT mark a 400 (bad request / invalid API key) response as retryable", async () => {
    mockFetchOnce(400, { error: { message: "API key not valid" } });

    await expect(provider.generateProjectPlan({ idea: "topic" })).rejects.toMatchObject({
      retryable: false,
    });
  });

  it("rejects with a ProviderError instance, not a plain error", async () => {
    mockFetchOnce(503, { error: { message: "high demand" } });

    await expect(provider.generateProjectPlan({ idea: "topic" })).rejects.toBeInstanceOf(ProviderError);
  });
});
