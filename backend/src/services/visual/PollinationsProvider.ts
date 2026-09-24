import { ProviderError } from "@/utils/errors";
import type { GenerateImageInput, GeneratedMedia, VisualGenerationProvider } from "./VisualGenerationProvider";

const ASPECT_RATIO_SIZE: Record<GenerateImageInput["aspectRatio"], { width: number; height: number }> = {
  LANDSCAPE_16_9: { width: 1344, height: 768 },
  PORTRAIT_9_16: { width: 768, height: 1344 },
  SQUARE_1_1: { width: 1024, height: 1024 },
};

export interface PollinationsProviderOptions {
  apiKey: string;
  baseUrl: string;
}

/**
 * Free-tier implementation of VisualGenerationProvider using Pollinations
 * (https://pollinations.ai), chosen because it needs no paid plan -- a
 * free account is enough to get a "secret key" with no meaningful rate
 * limit (unauthenticated/anonymous use is capped at ~1 image/hour/IP,
 * which is unusable for a multi-scene project).
 *
 * IMPORTANT: like OpenArtProvider, this was implemented from published
 * documentation, not verified against a live account in this environment
 * (no key was available at implementation time). The endpoint
 * (GET {baseUrl}/image/{prompt}), the Authorization: Bearer header, and
 * the width/height/seed/model query parameters are all documented, but
 * confirm the exact response shape/error format against your own key
 * before relying on this beyond local testing -- Pollinations does not
 * publish a negative-prompt parameter for this endpoint, so
 * `negativePrompt` is folded into the main prompt text instead of sent
 * separately.
 */
export class PollinationsProvider implements VisualGenerationProvider {
  constructor(private readonly options: PollinationsProviderOptions) {}

  async generateImage(input: GenerateImageInput): Promise<GeneratedMedia> {
    const { width, height } = ASPECT_RATIO_SIZE[input.aspectRatio];
    const promptParts = [input.prompt, input.styleReference, input.negativePrompt ? `avoid: ${input.negativePrompt}` : ""].filter(
      Boolean,
    );
    const prompt = promptParts.join(", ");

    const url = new URL(`/image/${encodeURIComponent(prompt)}`, this.options.baseUrl);
    url.searchParams.set("width", String(width));
    url.searchParams.set("height", String(height));
    url.searchParams.set("nologo", "true");

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.options.apiKey}` },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ProviderError("pollinations", `Failed to generate image (${res.status}): ${body}`, res.status >= 500);
    }

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) {
      const body = await res.text().catch(() => "");
      throw new ProviderError("pollinations", `Expected an image response but got ${contentType}: ${body.slice(0, 500)}`, true);
    }

    const data = Buffer.from(await res.arrayBuffer());
    return {
      data,
      mimeType: contentType,
      provider: "pollinations",
      metadata: { width, height, prompt },
    };
  }
}
