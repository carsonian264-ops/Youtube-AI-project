import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Load the repo-root .env explicitly rather than relying on dotenv's
// default cwd-relative lookup: npm workspaces run this script with its
// cwd set to backend/, not the repo root where .env actually lives (see
// ENVIRONMENT.md), so the bare `import "dotenv/config"` silently found
// nothing on a clean checkout.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

/**
 * Central environment configuration. Every variable the application reads
 * MUST be declared here so that a missing/invalid config fails fast at
 * startup instead of surfacing as a confusing runtime error deep in a
 * request handler or worker.
 */

const providerEnum = <T extends [string, ...string[]]>(values: T) => z.enum(values);

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    FRONTEND_URL: z.string().url().default("http://localhost:5173"),
    BACKEND_URL: z.string().url().default("http://localhost:4000"),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    REDIS_URL: z.string().min(1, "REDIS_URL is required"),

    JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
    JWT_EXPIRES_IN: z.string().default("7d"),
    SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),

    AI_PROVIDER: providerEnum(["mock", "claude", "gemini"]).default("mock"),
    ANTHROPIC_API_KEY: z.string().optional(),
    ANTHROPIC_MODEL: z.string().default("claude-sonnet-5"),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default("gemini-3.5-flash"),

    VISUAL_PROVIDER: providerEnum(["mock", "openart", "pollinations"]).default("mock"),
    OPENART_API_KEY: z.string().optional(),
    OPENART_BASE_URL: z.string().url().default("https://api.openart.ai"),
    POLLINATIONS_API_KEY: z.string().optional(),
    POLLINATIONS_BASE_URL: z.string().url().default("https://gen.pollinations.ai"),

    VOICE_PROVIDER: providerEnum(["mock", "tts", "pollinations", "edge-tts", "windows-sapi"]).default("mock"),
    TTS_API_KEY: z.string().optional(),
    TTS_PROVIDER_BASE_URL: z.string().url().default("https://api.elevenlabs.io"),

    STORAGE_PROVIDER: providerEnum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_ROOT: z.string().default("./storage"),
    STORAGE_BUCKET: z.string().optional(),
    STORAGE_REGION: z.string().optional(),
    STORAGE_ENDPOINT: z.string().optional(),
    STORAGE_ACCESS_KEY: z.string().optional(),
    STORAGE_SECRET_KEY: z.string().optional(),
    STORAGE_PUBLIC_BASE_URL: z.string().optional(),

    FFMPEG_PATH: z.string().default("/usr/bin/ffmpeg"),
    FFPROBE_PATH: z.string().default("/usr/bin/ffprobe"),

    PUBLISHING_PROVIDER: providerEnum(["mock", "youtube"]).default("mock"),
    YOUTUBE_CLIENT_ID: z.string().optional(),
    YOUTUBE_CLIENT_SECRET: z.string().optional(),
    YOUTUBE_REDIRECT_URI: z.string().optional(),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),

    LOG_LEVEL: providerEnum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  })
  .superRefine((val, ctx) => {
    // Cross-field validation: when a real provider is selected, its
    // credentials must be present. This prevents booting into a state
    // where the app *thinks* it can call Claude/OpenArt/S3/YouTube but
    // will fail on the first request.
    if (val.AI_PROVIDER === "claude" && !val.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ANTHROPIC_API_KEY"],
        message: "ANTHROPIC_API_KEY is required when AI_PROVIDER=claude",
      });
    }
    if (val.AI_PROVIDER === "gemini" && !val.GEMINI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GEMINI_API_KEY"],
        message: "GEMINI_API_KEY is required when AI_PROVIDER=gemini",
      });
    }
    if (val.VISUAL_PROVIDER === "openart" && !val.OPENART_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENART_API_KEY"],
        message: "OPENART_API_KEY is required when VISUAL_PROVIDER=openart",
      });
    }
    if (val.VISUAL_PROVIDER === "pollinations" && !val.POLLINATIONS_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["POLLINATIONS_API_KEY"],
        message: "POLLINATIONS_API_KEY is required when VISUAL_PROVIDER=pollinations",
      });
    }
    if (val.VOICE_PROVIDER === "tts" && !val.TTS_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TTS_API_KEY"],
        message: "TTS_API_KEY is required when VOICE_PROVIDER=tts",
      });
    }
    if (val.VOICE_PROVIDER === "pollinations" && !val.POLLINATIONS_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["POLLINATIONS_API_KEY"],
        message: "POLLINATIONS_API_KEY is required when VOICE_PROVIDER=pollinations",
      });
    }
    if (val.STORAGE_PROVIDER === "s3") {
      const required = ["STORAGE_BUCKET", "STORAGE_REGION", "STORAGE_ACCESS_KEY", "STORAGE_SECRET_KEY"] as const;
      for (const key of required) {
        if (!val[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when STORAGE_PROVIDER=s3`,
          });
        }
      }
    }
    if (val.PUBLISHING_PROVIDER === "youtube") {
      const required = ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REDIRECT_URI"] as const;
      for (const key of required) {
        if (!val[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when PUBLISHING_PROVIDER=youtube`,
          });
        }
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment configuration:");
    for (const issue of parsed.error.issues) {
      // eslint-disable-next-line no-console
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    throw new Error("Application failed to start due to invalid environment configuration.");
  }
  return parsed.data;
}

export const env = loadEnv();
