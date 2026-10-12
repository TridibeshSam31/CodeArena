import os from "os";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHTS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// Patterns for keys that likely contain sensitive secrets or tokens
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /key/i,
  /authorization/i,
  /cookie/i,
  /credential/i,
  /auth/i,
  /database_url/i,
  /redis_url/i,
  /^env$/i,
  /environment/i,
];

// Patterns for keys that contain user-submitted source code or raw input
const CODE_PAYLOAD_PATTERNS = [
  /^code$/i,
  /sourcecode/i,
  /source_code/i,
  /^stdin$/i,
  /^input$/i,
];

const MAX_STRING_LENGTH = 500;

/**
 * Mask credentials from database or Redis URLs (e.g. redis://:pass@host:6379)
 */
function sanitizeUrl(urlString: string): string {
  try {
    const parsed = new URL(urlString);
    if (parsed.password) parsed.password = "******";
    if (parsed.username) parsed.username = "******";
    return parsed.toString();
  } catch {
    return "[MALFORMED_OR_SENSITIVE_URL]";
  }
}

/**
 * Recursively sanitize objects, redacting secrets, stripping credentials,
 * bounding large string payloads, and preventing circular-reference infinite loops.
 */
function sanitizeValue(
  key: string,
  value: unknown,
  seen: WeakSet<object> = new WeakSet()
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  // 1. Redact keys containing secret patterns or raw environment dumps
  for (const pattern of SENSITIVE_KEY_PATTERNS) {
    if (pattern.test(key)) {
      return "[REDACTED]";
    }
  }

  // 2. Prevent dumping raw source code or stdin in logs
  for (const pattern of CODE_PAYLOAD_PATTERNS) {
    if (pattern.test(key)) {
      if (typeof value === "string") {
        const byteCount = Buffer.byteLength(value, "utf8");
        return `[${byteCount} bytes; preview omitted]`;
      }
      return "[CODE_PAYLOAD_OMITTED]";
    }
  }

  // 3. String handling: URL credentials & maximum length truncation
  if (typeof value === "string") {
    // If the string contains a URL with credentials, mask them
    if (value.includes("://") && value.includes("@")) {
      return sanitizeUrl(value);
    }

    if (value.length > MAX_STRING_LENGTH) {
      return `${value.slice(0, MAX_STRING_LENGTH)}... [truncated; total ${value.length} chars]`;
    }

    return value;
  }

  // 4. Numbers, booleans, and bigints are safe
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value;
  }

  // 5. Error serialization
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(value as unknown as Record<string, unknown>),
    };
  }

  // 6. Object / Array handling with circular-reference guard
  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[CIRCULAR_REFERENCE]";
    }
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item, index) =>
        sanitizeValue(String(index), item, seen)
      );
    }

    const sanitizedObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      sanitizedObj[k] = sanitizeValue(k, v, seen);
    }
    return sanitizedObj;
  }

  // Fallback for symbols or functions
  return String(value);
}

export interface LoggerContext {
  service?: string;
  submissionId?: string;
  jobId?: string;
  [key: string]: unknown;
}

export class StructuredLogger {
  private context: LoggerContext;
  private minLevel: LogLevel;

  constructor(context: LoggerContext = {}, minLevel?: LogLevel) {
    this.context = context;
    const envLevel = (process.env.LOG_LEVEL || "info").toLowerCase() as LogLevel;
    this.minLevel = minLevel || (LEVEL_WEIGHTS[envLevel] ? envLevel : "info");
  }

  /**
   * Spawns a child logger that inherits current context and merges new keys.
   * Crucial for correlating submissionId and jobId across asynchronous operations.
   */
  child(additionalContext: LoggerContext): StructuredLogger {
    return new StructuredLogger(
      { ...this.context, ...additionalContext },
      this.minLevel
    );
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_WEIGHTS[level] >= LEVEL_WEIGHTS[this.minLevel];
  }

  private write(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    error?: unknown
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const seen = new WeakSet<object>();

    // Standard production schema for centralized log indexing
    const record: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      service: this.context.service || "codearena",
      pid: process.pid,
      hostname: os.hostname(),
      message,
    };

    // Promote first-class correlation keys to root level for easy filtering
    if (this.context.submissionId) {
      record.submissionId = this.context.submissionId;
    }
    if (this.context.jobId) {
      record.jobId = this.context.jobId;
    }

    // Sanitize and attach remaining context properties
    for (const [k, v] of Object.entries(this.context)) {
      if (k !== "service" && k !== "submissionId" && k !== "jobId") {
        record[k] = sanitizeValue(k, v, seen);
      }
    }

    // Sanitize and attach event-specific data
    if (data && typeof data === "object") {
      for (const [k, v] of Object.entries(data)) {
        record[k] = sanitizeValue(k, v, seen);
      }
    }

    // Sanitize and attach error details if provided
    if (error !== undefined) {
      record.error = sanitizeValue("error", error, seen);
    }

    let jsonLine: string;
    try {
      jsonLine = JSON.stringify(record);
    } catch {
      // Fallback if stringification encounters unexpected failure
      jsonLine = JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "ERROR",
        service: this.context.service || "codearena",
        message: "Log serialization failure encountered",
        originalMessage: message,
      });
    }

    if (typeof process !== "undefined" && process.stdout?.write) {
      if (level === "error") {
        process.stderr.write(jsonLine + "\n");
      } else {
        process.stdout.write(jsonLine + "\n");
      }
    } else {
      if (level === "error") {
        console.error(jsonLine);
      } else {
        console.log(jsonLine);
      }
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.write("debug", message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.write("info", message, data);
  }

  warn(message: string, dataOrError?: unknown, extraDataOrError?: unknown): void {
    let data: Record<string, unknown> | undefined;
    let error: unknown | undefined;

    if (dataOrError instanceof Error) {
      error = dataOrError;
      if (typeof extraDataOrError === "object" && extraDataOrError !== null) {
        data = extraDataOrError as Record<string, unknown>;
      }
    } else if (typeof dataOrError === "object" && dataOrError !== null) {
      data = dataOrError as Record<string, unknown>;
      if (extraDataOrError !== undefined) {
        error = extraDataOrError;
      }
    } else if (dataOrError !== undefined) {
      error = dataOrError;
    }

    this.write("warn", message, data, error);
  }

  error(message: string, errorOrData?: unknown, extraData?: Record<string, unknown>): void {
    let data: Record<string, unknown> | undefined;
    let error: unknown | undefined;

    if (errorOrData instanceof Error) {
      error = errorOrData;
      data = extraData;
    } else if (typeof errorOrData === "object" && errorOrData !== null) {
      if (!extraData) {
        data = errorOrData as Record<string, unknown>;
      } else {
        error = errorOrData;
        data = extraData;
      }
    } else {
      error = errorOrData;
      data = extraData;
    }

    this.write("error", message, data, error);
  }
}

// Global default instance for convenience
export const logger = new StructuredLogger({
  service: "codearena",
});
