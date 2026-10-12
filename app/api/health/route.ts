import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getRedisClient } from "@/app/lib/redis";
import { submissionQueue } from "@/app/lib/queue";
import { logger } from "@/app/lib/logger";

interface HealthCheckResult {
  status: "healthy" | "unhealthy";
  latencyMs?: number;
  error?: string;
  details?: Record<string, unknown>;
}

export async function GET() {
  const healthLogger = logger.child({ service: "api-health" });
  const startTotal = Date.now();

  const checks: {
    database: HealthCheckResult;
    redis: HealthCheckResult;
    queue: HealthCheckResult;
  } = {
    database: { status: "unhealthy" },
    redis: { status: "unhealthy" },
    queue: { status: "unhealthy" },
  };

  // 1. Check PostgreSQL Database connection and query latency
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = {
      status: "healthy",
      latencyMs: Date.now() - dbStart,
    };
  } catch (error) {
    checks.database = {
      status: "unhealthy",
      error: error instanceof Error ? error.message : String(error),
    };
    healthLogger.error("Health check: Database ping failed", error);
  }

  // 2. Check Redis connection and ping latency
  try {
    const redisStart = Date.now();
    const redis = getRedisClient();
    const pingResponse = await redis.ping();
    if (pingResponse === "PONG") {
      checks.redis = {
        status: "healthy",
        latencyMs: Date.now() - redisStart,
      };
    } else {
      checks.redis = {
        status: "unhealthy",
        error: `Unexpected Redis ping response: ${pingResponse}`,
      };
    }
  } catch (error) {
    checks.redis = {
      status: "unhealthy",
      error: error instanceof Error ? error.message : String(error),
    };
    healthLogger.error("Health check: Redis ping failed", error);
  }

  // 3. Check BullMQ Queue depth and state
  try {
    const queueStart = Date.now();
    const jobCounts = await submissionQueue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed",
      "paused"
    );
    checks.queue = {
      status: "healthy",
      latencyMs: Date.now() - queueStart,
      details: {
        queueName: submissionQueue.name,
        waiting: jobCounts.waiting,
        active: jobCounts.active,
        completed: jobCounts.completed,
        failed: jobCounts.failed,
        delayed: jobCounts.delayed,
        paused: jobCounts.paused,
      },
    };
  } catch (error) {
    checks.queue = {
      status: "unhealthy",
      error: error instanceof Error ? error.message : String(error),
    };
    healthLogger.warn("Health check: Queue inspection failed", error);
  }

  const isHealthy =
    checks.database.status === "healthy" &&
    checks.redis.status === "healthy" &&
    checks.queue.status === "healthy";

  const totalDurationMs = Date.now() - startTotal;

  const mem = process.memoryUsage();
  const systemMetrics = {
    uptimeSeconds: Math.floor(process.uptime()),
    memory: {
      rssMb: Math.round(mem.rss / (1024 * 1024)),
      heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
      heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024)),
    },
  };

  const responseBody = {
    status: isHealthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    totalDurationMs,
    checks,
    system: systemMetrics,
  };

  return NextResponse.json(responseBody, {
    status: isHealthy ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
