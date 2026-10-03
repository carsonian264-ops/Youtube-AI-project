import { ProviderError } from "@/utils/errors";
import { logger } from "@/utils/logger";
import type { GenerateImageInput, GeneratedMedia, VisualGenerationProvider } from "./VisualGenerationProvider";

const ASPECT_RATIO_SIZE: Record<GenerateImageInput["aspectRatio"], { width: number; height: number }> = {
  LANDSCAPE_16_9: { width: 1344, height: 768 },
  PORTRAIT_9_16: { width: 768, height: 1344 },
  SQUARE_1_1: { width: 1024, height: 1024 },
};

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120_000;
// Bounds a single HTTP call, distinct from POLL_TIMEOUT_MS (which bounds
// the whole poll loop across many calls). Without this, a stalled TCP
// connection to OpenArt -- not a slow-but-completing response, but a
// socket that never resolves -- would hang the worker indefinitely, since
// `fetch` has no timeout of its own and the poll loop never gets to its
// next deadline check mid-call. See EdgeVoiceProvider.ts for the same
// class of problem solved via Promise.race for a non-fetch client.
const REQUEST_TIMEOUT_MS = 30_000;

export interface OpenArtProviderOptions {
  apiKey: string;
  baseUrl: string;
}

/**
 * Real OpenArt implementation of VisualGenerationProvider.
 *
 * IMPORTANT: OpenArt's exact REST surface (endpoint paths, request/response
 * field names, async job semantics) can change and could not be verified
 * against a live account in this environment (no OPENART_API_KEY was
 * available at implementation time). The request/poll/download flow below
 * follows OpenArt's documented generation-job pattern as of implementation
 * time. Before relying on this in production, confirm the endpoint paths
 * and payload shape against the current OpenArt API reference and adjust
 * `createGenerationJob` / `pollGenerationJob` accordingly -- the rest of
 * the app (queues, storage, rendering) does not need to change since it
 * only depends on the VisualGenerationProvider interface.
 */
export class OpenArtProvider implements VisualGenerationProvider {
  constructor(private readonly options: OpenArtProviderOptions) {}

  async generateImage(input: GenerateImageInput): Promise<GeneratedMedia> {
    const { width, height } = ASPECT_RATIO_SIZE[input.aspectRatio];
    const prompt = input.styleReference ? `${input.prompt}, ${input.styleReference}` : input.prompt;

    try {
      const jobId = await this.createGenerationJob({
        prompt,
        negativePrompt: input.negativePrompt,
        width,
        height,
      });

      const resultUrl = await this.pollGenerationJob(jobId);
      const data = await this.downloadImage(resultUrl);

      return {
        data,
        mimeType: "image/png",
        provider: "openart",
        metadata: { jobId, width, height, prompt },
      };
    } catch (err) {
      // A REQUEST_TIMEOUT_MS abort surfaces as a raw DOMException
      // ("TimeoutError"/"AbortError"), not a ProviderError -- normalize it
      // here the same way GeminiProvider's outer catch does, so callers
      // always see a consistent, retryable ProviderError rather than
      // having to special-case fetch's own abort error shape.
      if (err instanceof ProviderError) throw err;
      logger.error({ err }, "OpenArt image generation failed");
      throw new ProviderError("openart", err instanceof Error ? err.message : "Unknown OpenArt error", true);
    }
  }

  private async createGenerationJob(params: {
    prompt: string;
    negativePrompt?: string;
    width: number;
    height: number;
  }): Promise<string> {
    const res = await fetch(`${this.options.baseUrl}/v1/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: params.prompt,
        negative_prompt: params.negativePrompt,
        width: params.width,
        height: params.height,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      // The raw body goes in `details`, not interpolated into the message:
      // errorHandler.ts strips `details` from 5xx responses before they
      // reach the client specifically so an upstream provider's own error
      // text (which could echo back request content, or just be noisy
      // HTML) never leaks through our API -- putting it in the message
      // string instead would silently defeat that protection.
      const body = await res.text().catch(() => "");
      // 429 (rate limited) deserves the same retry treatment as a 5xx --
      // the request didn't fail because it was wrong, just because this
      // attempt was too soon (see GeminiProvider's identical reasoning).
      const retryable = res.status >= 500 || res.status === 429;
      throw new ProviderError("openart", `Failed to create generation job (${res.status})`, retryable, body);
    }

    let json: { id?: string; job_id?: string };
    try {
      json = (await res.json()) as { id?: string; job_id?: string };
    } catch {
      throw new ProviderError("openart", "Generation job response was not valid JSON", true);
    }
    const jobId = json.id ?? json.job_id;
    if (!jobId) {
      throw new ProviderError("openart", "Generation job response did not include a job id", false, json);
    }
    return jobId;
  }

  private async pollGenerationJob(jobId: string): Promise<string> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const res = await fetch(`${this.options.baseUrl}/v1/generations/${jobId}`, {
        headers: { Authorization: `Bearer ${this.options.apiKey}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const retryable = res.status >= 500 || res.status === 429;
        throw new ProviderError("openart", `Failed to poll generation job (${res.status})`, retryable, body);
      }

      let json: { status?: string; output_url?: string; url?: string; error?: string };
      try {
        json = (await res.json()) as { status?: string; output_url?: string; url?: string; error?: string };
      } catch {
        throw new ProviderError("openart", "Generation job poll response was not valid JSON", true);
      }

      if (json.status === "completed" || json.status === "succeeded") {
        const url = json.output_url ?? json.url;
        if (!url) {
          throw new ProviderError("openart", "Completed generation job did not include an output URL", false, json);
        }
        return url;
      }

      if (json.status === "failed" || json.status === "error") {
        throw new ProviderError("openart", json.error ?? "Generation job failed", true, json);
      }

      logger.debug({ jobId, status: json.status }, "Polling OpenArt generation job");
      await sleep(POLL_INTERVAL_MS);
    }

    throw new ProviderError("openart", `Generation job ${jobId} timed out after ${POLL_TIMEOUT_MS}ms`, true);
  }

  private async downloadImage(url: string): Promise<Buffer> {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) {
      throw new ProviderError("openart", `Failed to download generated image (${res.status})`, true);
    }
    return Buffer.from(await res.arrayBuffer());
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
