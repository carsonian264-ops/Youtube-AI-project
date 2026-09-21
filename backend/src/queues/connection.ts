import IORedis from "ioredis";
import { env } from "@/config/env";

/**
 * Shared Redis connection for BullMQ. BullMQ requires maxRetriesPerRequest
 * to be null on connections used by Workers/QueueEvents (blocking
 * commands); we set it globally here so every queue/worker built from
 * this connection is compliant without repeating the option everywhere.
 */
export const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});
