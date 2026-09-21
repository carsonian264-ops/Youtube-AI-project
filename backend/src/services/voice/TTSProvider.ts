import { ProviderError } from "@/utils/errors";
import type { GeneratedAudio, GenerateSpeechInput, VoiceGenerationProvider } from "./VoiceGenerationProvider";

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // ElevenLabs' public default "Rachel" voice.

export interface TTSProviderOptions {
  apiKey: string;
  baseUrl: string;
}

/**
 * Real text-to-speech implementation, written against an
 * ElevenLabs-compatible REST API (TTS_PROVIDER_BASE_URL defaults to
 * ElevenLabs). Swap TTS_PROVIDER_BASE_URL and voiceId conventions here if
 * a different TTS vendor is chosen -- the rest of the app only depends on
 * VoiceGenerationProvider.
 */
export class TTSProvider implements VoiceGenerationProvider {
  constructor(private readonly options: TTSProviderOptions) {}

  async generateSpeech(input: GenerateSpeechInput): Promise<GeneratedAudio> {
    const voiceId = input.voiceId ?? DEFAULT_VOICE_ID;
    const res = await fetch(`${this.options.baseUrl}/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": this.options.apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: input.text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ProviderError("tts", `Speech generation failed (${res.status}): ${body}`, res.status >= 500);
    }

    const data = Buffer.from(await res.arrayBuffer());
    return { data, mimeType: "audio/mpeg", provider: "tts", metadata: { voiceId, characters: input.text.length } };
  }
}
