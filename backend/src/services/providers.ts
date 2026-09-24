import { env } from "@/config/env";
import { usageService } from "@/services/usage/UsageService";
import type { AIContentProvider } from "./ai/AIContentProvider";
import { ClaudeProvider } from "./ai/ClaudeProvider";
import { MockAIContentProvider } from "./ai/MockAIContentProvider";
import type { VisualGenerationProvider } from "./visual/VisualGenerationProvider";
import { OpenArtProvider } from "./visual/OpenArtProvider";
import { PollinationsProvider } from "./visual/PollinationsProvider";
import { MockVisualGenerationProvider } from "./visual/MockVisualGenerationProvider";
import type { VoiceGenerationProvider } from "./voice/VoiceGenerationProvider";
import { TTSProvider } from "./voice/TTSProvider";
import { PollinationsVoiceProvider } from "./voice/PollinationsVoiceProvider";
import { MockVoiceGenerationProvider } from "./voice/MockVoiceGenerationProvider";
import type { StorageProvider } from "./storage/StorageProvider";
import { LocalStorageProvider } from "./storage/LocalStorageProvider";
import { S3StorageProvider } from "./storage/S3StorageProvider";
import type { VideoRenderer } from "./video/VideoRenderer";
import { FFmpegRenderer } from "./video/FFmpegRenderer";
import type { PublishingProvider } from "./publishing/PublishingProvider";
import { YouTubeProvider } from "./publishing/YouTubeProvider";
import { MockPublishingProvider } from "./publishing/MockPublishingProvider";

/**
 * Composition root: the ONLY file in the application allowed to
 * `new` a concrete provider implementation. Every controller, service,
 * and worker asks for a provider by interface through the functions
 * below, and gets the real or mock implementation based on env vars
 * (AI_PROVIDER, VISUAL_PROVIDER, VOICE_PROVIDER, STORAGE_PROVIDER,
 * PUBLISHING_PROVIDER). This is what makes it possible to replace any
 * external vendor without touching business logic.
 */

export interface UsageContext {
  userId: string;
  projectId?: string;
  jobId?: string;
}

export function createAIContentProvider(usage?: UsageContext): AIContentProvider {
  if (env.AI_PROVIDER === "claude") {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured but AI_PROVIDER=claude");
    }
    return new ClaudeProvider({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL,
      onUsage: usage
        ? (event) => {
            void usageService.record({
              userId: usage.userId,
              projectId: usage.projectId,
              jobId: usage.jobId,
              type: "CLAUDE_TOKENS",
              quantity: event.inputTokens + event.outputTokens,
              unit: "tokens",
              metadata: { operation: event.operation, inputTokens: event.inputTokens, outputTokens: event.outputTokens },
            });
          }
        : undefined,
    });
  }
  return new MockAIContentProvider();
}

export function createVisualGenerationProvider(): VisualGenerationProvider {
  if (env.VISUAL_PROVIDER === "openart") {
    if (!env.OPENART_API_KEY) {
      throw new Error("OPENART_API_KEY is not configured but VISUAL_PROVIDER=openart");
    }
    return new OpenArtProvider({ apiKey: env.OPENART_API_KEY, baseUrl: env.OPENART_BASE_URL });
  }
  if (env.VISUAL_PROVIDER === "pollinations") {
    if (!env.POLLINATIONS_API_KEY) {
      throw new Error("POLLINATIONS_API_KEY is not configured but VISUAL_PROVIDER=pollinations");
    }
    return new PollinationsProvider({ apiKey: env.POLLINATIONS_API_KEY, baseUrl: env.POLLINATIONS_BASE_URL });
  }
  return new MockVisualGenerationProvider();
}

export function createVoiceGenerationProvider(): VoiceGenerationProvider {
  if (env.VOICE_PROVIDER === "tts") {
    if (!env.TTS_API_KEY) {
      throw new Error("TTS_API_KEY is not configured but VOICE_PROVIDER=tts");
    }
    return new TTSProvider({ apiKey: env.TTS_API_KEY, baseUrl: env.TTS_PROVIDER_BASE_URL });
  }
  if (env.VOICE_PROVIDER === "pollinations") {
    if (!env.POLLINATIONS_API_KEY) {
      throw new Error("POLLINATIONS_API_KEY is not configured but VOICE_PROVIDER=pollinations");
    }
    return new PollinationsVoiceProvider({ apiKey: env.POLLINATIONS_API_KEY, baseUrl: env.POLLINATIONS_BASE_URL });
  }
  return new MockVoiceGenerationProvider();
}

let storageProviderSingleton: StorageProvider | undefined;

export function createStorageProvider(): StorageProvider {
  if (storageProviderSingleton) return storageProviderSingleton;

  if (env.STORAGE_PROVIDER === "s3") {
    if (!env.STORAGE_BUCKET || !env.STORAGE_REGION || !env.STORAGE_ACCESS_KEY || !env.STORAGE_SECRET_KEY) {
      throw new Error("S3 storage credentials are not fully configured but STORAGE_PROVIDER=s3");
    }
    storageProviderSingleton = new S3StorageProvider({
      bucket: env.STORAGE_BUCKET,
      region: env.STORAGE_REGION,
      endpoint: env.STORAGE_ENDPOINT,
      accessKeyId: env.STORAGE_ACCESS_KEY,
      secretAccessKey: env.STORAGE_SECRET_KEY,
      publicBaseUrl: env.STORAGE_PUBLIC_BASE_URL,
    });
  } else {
    storageProviderSingleton = new LocalStorageProvider();
  }
  return storageProviderSingleton;
}

export function createVideoRenderer(): VideoRenderer {
  return new FFmpegRenderer();
}

export function createPublishingProvider(): PublishingProvider {
  if (env.PUBLISHING_PROVIDER === "youtube") {
    if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET || !env.YOUTUBE_REDIRECT_URI) {
      throw new Error("YouTube OAuth credentials are not fully configured but PUBLISHING_PROVIDER=youtube");
    }
    return new YouTubeProvider({
      clientId: env.YOUTUBE_CLIENT_ID,
      clientSecret: env.YOUTUBE_CLIENT_SECRET,
      redirectUri: env.YOUTUBE_REDIRECT_URI,
    });
  }
  return new MockPublishingProvider();
}
