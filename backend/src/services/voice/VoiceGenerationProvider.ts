export interface GenerateSpeechInput {
  text: string;
  /** Provider-specific voice identifier; falls back to a sensible default narration voice. */
  voiceId?: string;
}

export interface GeneratedAudio {
  data: Buffer;
  mimeType: string;
  provider: string;
  durationSeconds?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Abstraction over text-to-speech narration generation. Business logic
 * depends only on this interface so the TTS vendor (VOICE_PROVIDER env
 * var) can be swapped without touching scene/voice orchestration code.
 */
export interface VoiceGenerationProvider {
  generateSpeech(input: GenerateSpeechInput): Promise<GeneratedAudio>;
}
