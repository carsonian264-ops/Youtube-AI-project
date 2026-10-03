import { ProviderError } from "@/utils/errors";
import type { GeneratedAudio, GenerateSpeechInput, VoiceGenerationProvider } from "./VoiceGenerationProvider";

const DEFAULT_VOICE = "alloy"; // neutral, professional -- a sensible default narration voice.

export interface PollinationsVoiceProviderOptions {
  apiKey: string;
  baseUrl: string;
}

/**
 * Free-tier implementation of VoiceGenerationProvider, reusing the same
 * Pollinations account/secret key as PollinationsProvider (visuals) --
 * Pollinations offers text/image/audio/video under one API, so a single
 * signup covers both. Implemented from published documentation, not
 * verified against a live account at implementation time; see
 * PollinationsProvider.ts for the same caveat.
 */
export class PollinationsVoiceProvider implements VoiceGenerationProvider {
  constructor(private readonly options: PollinationsVoiceProviderOptions) {}

  async generateSpeech(input: GenerateSpeechInput): Promise<GeneratedAudio> {
    const voice = input.voiceId ?? DEFAULT_VOICE;
    const url = new URL(`/audio/${encodeURIComponent(input.text)}`, this.options.baseUrl);
    url.searchParams.set("voice", voice);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.options.apiKey}` },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      // Raw body goes in `details`, not the message -- see
      // OpenArtProvider.ts's identical fix for why.
      const body = await res.text().catch(() => "");
      throw new ProviderError("pollinations-voice", `Failed to generate speech (${res.status})`, res.status >= 500, body);
    }

    const contentType = res.headers.get("content-type") ?? "audio/mpeg";
    if (!contentType.startsWith("audio/")) {
      const body = await res.text().catch(() => "");
      throw new ProviderError("pollinations-voice", `Expected audio but got ${contentType}`, true, body.slice(0, 500));
    }

    const data = Buffer.from(await res.arrayBuffer());
    return {
      data,
      mimeType: contentType,
      provider: "pollinations",
      metadata: { voice, characters: input.text.length },
    };
  }
}
