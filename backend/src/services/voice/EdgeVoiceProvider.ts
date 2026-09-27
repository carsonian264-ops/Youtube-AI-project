import { EdgeTTS } from "@travisvn/edge-tts";
import { ProviderError } from "@/utils/errors";
import type { GeneratedAudio, GenerateSpeechInput, VoiceGenerationProvider } from "./VoiceGenerationProvider";

const DEFAULT_VOICE = "en-US-EmmaMultilingualNeural";
const SYNTHESIZE_TIMEOUT_MS = 20_000;

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
      // The underlying WebSocket connection to Microsoft's TTS endpoint has
      // no timeout of its own -- if the handshake stalls (a flaky network,
      // a firewall silently dropping the upgrade, etc.) synthesize() never
      // resolves or rejects, and the voice-generation job hangs forever
      // with no error for the queue's retry logic to act on. Racing it
      // against a timeout turns that silent hang into a retryable failure.
      const result = await Promise.race([
        tts.synthesize(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Edge TTS did not respond within ${SYNTHESIZE_TIMEOUT_MS}ms`)), SYNTHESIZE_TIMEOUT_MS),
        ),
      ]);
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
