import { getRedisClient } from "./redis";
import { logger } from "./logger";

export interface TokenBucketConfig {
  capacity: number;       // Maximum burst capacity (e.g. 5 tokens)
  refillRate: number;     // Tokens added per second (e.g. 0.25 = 1 token every 4s = 15/min sustained)
  cost?: number;          // Tokens consumed per request (default: 1)
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter: number;     // Seconds to wait until next token is available
}

// In-memory fallback bucket store if Redis is unavailable
interface MemoryBucket {
  tokens: number;
  lastRefill: number; // in seconds
}
const memoryBuckets = new Map<string, MemoryBucket>();

function checkMemoryTokenBucket(
  key: string,
  capacity: number,
  refillRate: number,
  cost: number,
  nowSec: number
): RateLimitResult {
  let bucket = memoryBuckets.get(key);

  if (!bucket) {
    bucket = { tokens: capacity, lastRefill: nowSec };
  } else {
    const delta = Math.max(0, nowSec - bucket.lastRefill);
    bucket.tokens = Math.min(capacity, bucket.tokens + delta * refillRate);
    bucket.lastRefill = nowSec;
  }

  if (bucket.tokens >= cost) {
    bucket.tokens -= cost;
    memoryBuckets.set(key, bucket);
    return {
      allowed: true,
      limit: capacity,
      remaining: Math.floor(bucket.tokens),
      retryAfter: 0,
    };
  }

  const retryAfter = Math.ceil((cost - bucket.tokens) / refillRate);
  memoryBuckets.set(key, bucket);

  return {
    allowed: false,
    limit: capacity,
    remaining: 0,
    retryAfter: Math.max(1, retryAfter),
  };
}

/**
 * Atomic Lua script implementing the Token Bucket algorithm in Redis.
 * Runs atomically in a single round-trip without race conditions.
 *
 * KEYS[1] = bucket key
 * ARGV[1] = capacity
 * ARGV[2] = refill_rate (tokens/sec)
 * ARGV[3] = cost
 * ARGV[4] = current_time (seconds)
 */
const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local now = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(data[1])
local last_refill = tonumber(data[2])

if not tokens or not last_refill then
    tokens = capacity
    last_refill = now
else
    local delta = math.max(0, now - last_refill)
    tokens = math.min(capacity, tokens + delta * refill_rate)
    last_refill = now
end

local allowed = 0
local retry_after = 0

if tokens >= cost then
    allowed = 1
    tokens = tokens - cost
else
    allowed = 0
    retry_after = math.ceil((cost - tokens) / refill_rate)
end

redis.call('HSET', key, 'tokens', tokens, 'last_refill', last_refill)
redis.call('EXPIRE', key, math.ceil(capacity / refill_rate * 2))

return { allowed, math.floor(tokens), math.max(1, retry_after) }
`;

/**
 * Extracts client IP safely from request headers (proxies, load balancers, Cloudflare).
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp?.trim()) {
    return realIp.trim();
  }

  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp?.trim()) {
    return cfConnectingIp.trim();
  }

  return "127.0.0.1";
}

/**
 * Enforces rate limiting using the Token Bucket algorithm.
 *
 * @param identifier Unique identifier, typically client IP
 * @param config Bucket capacity (burst allowance) and refill rate (sustained speed)
 * Default: 5 burst capacity, 0.25 tokens/sec (1 token added every 4s = 15/min sustained)
 */
export async function checkRateLimit(
  identifier: string,
  config: TokenBucketConfig = {
    capacity: 5,        // Burst allowance: up to 5 requests immediately
    refillRate: 0.25,   // 1 token added every 4s = 15/min sustained rate
    cost: 1,
  }
): Promise<RateLimitResult> {
  const capacity = config.capacity;
  const refillRate = config.refillRate;
  const cost = config.cost ?? 1;
  const nowSec = Date.now() / 1000;
  const key = `ratelimit:tb:${identifier}`;

  try {
    const redis = getRedisClient();

    const rawResult = (await redis.eval(
      TOKEN_BUCKET_LUA,
      1,
      key,
      capacity,
      refillRate,
      cost,
      nowSec
    )) as [number, number, number];

    const allowed = rawResult[0] === 1;
    const remaining = rawResult[1];
    const retryAfter = allowed ? 0 : rawResult[2];

    return {
      allowed,
      limit: capacity,
      remaining,
      retryAfter,
    };
  } catch (error) {
    logger.warn("Redis token bucket rate limiter failed; falling back to in-memory store", {
      identifier,
      error: error instanceof Error ? error.message : String(error),
    });

    return checkMemoryTokenBucket(identifier, capacity, refillRate, cost, nowSec);
  }
}
