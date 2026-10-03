import { OpenArtProvider } from "./OpenArtProvider";
import { ProviderError } from "@/utils/errors";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

const input = {
  prompt: "a cat on a skateboard",
  aspectRatio: "LANDSCAPE_16_9" as const,
};

describe("OpenArtProvider", () => {
  const provider = new OpenArtProvider({ apiKey: "test-key", baseUrl: "https://api.openart.test" });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("creates a job, polls until completed, and downloads the result", async () => {
    const fetchMock = jest
      .fn()
      // create
      .mockResolvedValueOnce(jsonResponse(200, { id: "job-1" }))
      // poll: still running, then completed
      .mockResolvedValueOnce(jsonResponse(200, { status: "processing" }))
      .mockResolvedValueOnce(jsonResponse(200, { status: "completed", output_url: "https://cdn.openart.test/out.png" }))
      // download
      .mockResolvedValueOnce({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await provider.generateImage(input);

    expect(result.provider).toBe("openart");
    expect(result.mimeType).toBe("image/png");
    expect(Buffer.from(result.data)).toEqual(Buffer.from([1, 2, 3]));
    expect(fetchMock).toHaveBeenCalledTimes(4);
  }, 10_000);

  it("marks a 429 (rate limited) response as retryable", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(429, { error: "rate limited" })) as unknown as typeof fetch;

    await expect(provider.generateImage(input)).rejects.toMatchObject({ retryable: true });
  });

  it("does NOT mark a 400 (bad request) response as retryable", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(400, { error: "bad prompt" })) as unknown as typeof fetch;

    await expect(provider.generateImage(input)).rejects.toMatchObject({ retryable: false });
  });

  it("puts the raw upstream error body in `details`, not in the client-facing `message`", async () => {
    // Regression test: errorHandler.ts strips `details` from 5xx
    // responses before they reach the client, but always returns
    // `message` -- so the raw body must never end up there, or that
    // protection is silently bypassed (see the fix's commit message).
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(500, { secret_internal_detail: "do not leak this" })) as unknown as typeof fetch;

    try {
      await provider.generateImage(input);
      throw new Error("expected generateImage to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
      const providerErr = err as ProviderError;
      expect(providerErr.message).not.toContain("do not leak this");
      expect(JSON.stringify(providerErr.details)).toContain("do not leak this");
    }
  });

  it("raises a retryable ProviderError when the response body is not valid JSON", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "<html>not json</html>",
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    }) as unknown as typeof fetch;

    await expect(provider.generateImage(input)).rejects.toBeInstanceOf(ProviderError);
    await expect(provider.generateImage(input)).rejects.toMatchObject({ retryable: true });
  });

  it("raises a ProviderError when the job reports failed status", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: "job-2" }))
      .mockResolvedValueOnce(jsonResponse(200, { status: "failed", error: "content policy violation" }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(provider.generateImage(input)).rejects.toMatchObject({
      retryable: true,
      message: expect.stringContaining("content policy violation"),
    });
  });

  it("sends an AbortSignal (request timeout) on every fetch call", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: "job-3" }))
      .mockResolvedValueOnce(jsonResponse(200, { status: "completed", output_url: "https://cdn.openart.test/out.png" }))
      .mockResolvedValueOnce({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1]).buffer });
    global.fetch = fetchMock as unknown as typeof fetch;

    await provider.generateImage(input);

    for (const call of fetchMock.mock.calls) {
      const options = call[1] as RequestInit | undefined;
      expect(options?.signal).toBeInstanceOf(AbortSignal);
    }
  });
});
