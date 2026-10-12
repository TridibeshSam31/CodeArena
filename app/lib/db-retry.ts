import { Prisma } from "@prisma/client";
import { logger } from "./logger";

export interface DbRetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
  operationName?: string;
  context?: Record<string, unknown>;
}

// Known non-retryable Prisma error codes
// P2002: Unique constraint failed
// P2003: Foreign key constraint failed
// P2025: Record to update/delete not found
// P2000: Value out of range for column
// P2001: Record searched for in where condition does not exist
// P2005: Invalid value stored in database
// P2006: Provided value for field is not valid
const NON_RETRYABLE_PRISMA_CODES = new Set([
  "P2000",
  "P2001",
  "P2002",
  "P2003",
  "P2005",
  "P2006",
  "P2025",
]);

/**
 * Classifies whether a database error is transient (and therefore safe to retry)
 * versus permanent (such as validation errors, constraints, or missing rows).
 */
export function isRetryableDbError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (NON_RETRYABLE_PRISMA_CODES.has(error.code)) {
      return false;
    }
    // Transient codes include:
    // P1001: Can't reach database server
    // P1002: Database server reached but connection timed out
    // P1008: Operations timed out
    // P1017: Server has closed the connection
    // P2034: Transaction failed due to write conflict or deadlock
    return true;
  }

  // Schema or query syntax mismatches are non-retryable programming errors
  if (error instanceof Prisma.PrismaClientValidationError) {
    return false;
  }

  // Connection initialization failures (common during Neon serverless cold starts)
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  // Rust engine panic is unrecoverable without restarting client
  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return false;
  }

  // Fallback to inspecting common network disconnect error messages
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes("econnreset") ||
      msg.includes("etimedout") ||
      msg.includes("enotfound") ||
      msg.includes("connection closed") ||
      msg.includes("connection terminated") ||
      msg.includes("socket hang up")
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Executes a database operation with bounded exponential backoff retries.
 * Transient infrastructure/connection issues are retried up to maxAttempts.
 * Permanent errors (e.g. Record Not Found) fail fast without retrying.
 */
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  options: DbRetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 500;
  const backoffFactor = options.backoffFactor ?? 2;
  const operationName = options.operationName ?? "database_operation";

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isRetryableDbError(error) || attempt >= maxAttempts) {
        throw error;
      }

      const delay = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
      logger.warn(`Transient database error encountered; retrying operation`, {
        operation: operationName,
        attempt,
        maxAttempts,
        nextDelayMs: delay,
        ...(options.context || {}),
        error: error instanceof Error ? error.message : String(error),
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
