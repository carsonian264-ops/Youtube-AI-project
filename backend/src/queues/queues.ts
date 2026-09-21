import { Queue } from "bullmq";
import { redisConnection } from "./connection";

/**
 * One BullMQ queue per pipeline stage (spec section 12). Queue names are
 * the single source of truth mapping a JobType to a Redis queue; workers
 * (queues/workers/*.worker.ts) and enqueue() below both import from here
 * so the two can never drift apart.
 */
export const QUEUE_NAMES = {
  CONTENT_GENERATION: "content-generation",
  VISUAL_GENERATION: "visual-generation",
  VOICE_GENERATION: "voice-generation",
  CAPTION_GENERATION: "caption-generation",
  VIDEO_RENDERING: "video-rendering",
  THUMBNAIL_GENERATION: "thumbnail-generation",
  PUBLISHING: "publishing",
  QUALITY_CHECK: "quality-check",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5000 },
  removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 },
  removeOnFail: { age: 60 * 60 * 24 * 30 },
};

function makeQueue(name: QueueName): Queue {
  return new Queue(name, { connection: redisConnection, defaultJobOptions });
}

export const queues: Record<QueueName, Queue> = {
  [QUEUE_NAMES.CONTENT_GENERATION]: makeQueue(QUEUE_NAMES.CONTENT_GENERATION),
  [QUEUE_NAMES.VISUAL_GENERATION]: makeQueue(QUEUE_NAMES.VISUAL_GENERATION),
  [QUEUE_NAMES.VOICE_GENERATION]: makeQueue(QUEUE_NAMES.VOICE_GENERATION),
  [QUEUE_NAMES.CAPTION_GENERATION]: makeQueue(QUEUE_NAMES.CAPTION_GENERATION),
  [QUEUE_NAMES.VIDEO_RENDERING]: makeQueue(QUEUE_NAMES.VIDEO_RENDERING),
  [QUEUE_NAMES.THUMBNAIL_GENERATION]: makeQueue(QUEUE_NAMES.THUMBNAIL_GENERATION),
  [QUEUE_NAMES.PUBLISHING]: makeQueue(QUEUE_NAMES.PUBLISHING),
  [QUEUE_NAMES.QUALITY_CHECK]: makeQueue(QUEUE_NAMES.QUALITY_CHECK),
};

export const JOB_TYPE_TO_QUEUE_NAME = {
  CONTENT_GENERATION: QUEUE_NAMES.CONTENT_GENERATION,
  VISUAL_GENERATION: QUEUE_NAMES.VISUAL_GENERATION,
  VOICE_GENERATION: QUEUE_NAMES.VOICE_GENERATION,
  CAPTION_GENERATION: QUEUE_NAMES.CAPTION_GENERATION,
  VIDEO_RENDERING: QUEUE_NAMES.VIDEO_RENDERING,
  THUMBNAIL_GENERATION: QUEUE_NAMES.THUMBNAIL_GENERATION,
  PUBLISHING: QUEUE_NAMES.PUBLISHING,
  QUALITY_CHECK: QUEUE_NAMES.QUALITY_CHECK,
} as const;
