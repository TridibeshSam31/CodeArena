import IORedis from "ioredis";
import { logger } from "./logger";

const globalForRedis = global as unknown as {
  redisClient?: IORedis;
};

/**
 * Returns a singleton IORedis client for application utilities
 * such as rate-limiting and health checks.
 */
export function getRedisClient(): IORedis {
  if (!globalForRedis.redisClient) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("REDIS_URL environment variable is not defined");
    }

    const client = new IORedis(redisUrl, {
      maxRetriesPerRequest: 2,
      connectTimeout: 5000,
      lazyConnect: false,
      retryStrategy(times) {
        // Bounded retry with max 3s delay
        return Math.min(times * 200, 3000);
      },
    });

    client.on("error", (err) => {
      logger.error("Redis client encountered a connection error", err);
    });

    globalForRedis.redisClient = client;
  }

  return globalForRedis.redisClient;
}
