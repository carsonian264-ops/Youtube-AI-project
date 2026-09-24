import { EdgeTTS } from "@travisvn/edge-tts";
import { ProviderError } from "@/utils/errors";
import type { GeneratedAudio, GenerateSpeechInput, VoiceGenerationProvider } from "./VoiceGenerationProvider";

const DEFAULT_VOICE = "en-US-EmmaMultilingualNeural";

/**
 * Free, no-signup, no-API-key implementation of VoiceGenerationProvider
 * using Microsoft Edge's online "Read Aloud" text-to-speech service via
 * the @travisvn/edge-tts package -- the same service Edge's browser
 * feature uses, accessed directly rather than through the browser, so it
 * needs no Microsoft account, no API key, and no cost. Chosen after
 * Pollinations' own voice endpoint turned out to require a paid balance
 * (unlike its image endpoint, which is genuinely free).
 */
export class EdgeVoiceProvider implements VoiceGenerationProvider {
  async generateSpeech(input: GenerateSpeechInput): Promise<GeneratedAudio> {
    const voice = input.voiceId ?? DEFAULT_VOICE;
    try {
      const tts = new EdgeTTS(input.text, voice);
      const result = await tts.synthesize();
      const data = Buffer.from(await result.audio.arrayBuffer());
      return {
        data,
        mimeType: "audio/mpeg",
        provider: "edge-tts",
        metadata: { voice, characters: input.text.length },
      };
    } catch (err) {
      throw new ProviderError("edge-tts", err instanceof Error ? err.message : "Unknown Edge TTS error", true);
    }
  }
}
