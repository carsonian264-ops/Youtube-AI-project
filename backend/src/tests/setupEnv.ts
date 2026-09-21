/**
 * Runs before Jest loads any test module (see jest.config.js
 * setupFiles). Every env var config/env.ts requires must be set here so
 * that importing it inside a test doesn't throw -- the test suite points
 * at the real local Postgres "ai_content_studio_test" database and the
 * real local Redis instance, never mocks of them, per the project's
 * "test against real infrastructure" approach.
 */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://studio:studio_dev_password@localhost:5432/ai_content_studio_test";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
process.env.JWT_SECRET = "test-jwt-secret-please-do-not-use-in-prod";
process.env.SESSION_SECRET = "test-session-secret-please-do-not-use-in-prod";
process.env.AI_PROVIDER = "mock";
process.env.VISUAL_PROVIDER = "mock";
process.env.VOICE_PROVIDER = "mock";
process.env.STORAGE_PROVIDER = "local";
process.env.STORAGE_LOCAL_ROOT = "./storage-test";
process.env.PUBLISHING_PROVIDER = "mock";
process.env.FFMPEG_PATH = process.env.FFMPEG_PATH ?? "/usr/bin/ffmpeg";
process.env.FFPROBE_PATH = process.env.FFPROBE_PATH ?? "/usr/bin/ffprobe";
process.env.LOG_LEVEL = "error";
