import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { submissionQueue } from "@/app/lib/queue";
import { logger } from "@/app/lib/logger";
import { checkRateLimit, getClientIp } from "@/app/lib/rate-limiter";

const SUPPORTED_LANGUAGES = ["cpp", "python", "c"];

export async function POST(request: NextRequest) {
  const reqLogger = logger.child({ service: "api-submit" });

  const clientIp = getClientIp(request);

  // 1. Enforce rate limiting before performing database operations
  const rateLimitResult = await checkRateLimit(clientIp);
  if (!rateLimitResult.allowed) {
    reqLogger.warn("Rate limit exceeded for client IP", {
      clientIp,
      limit: rateLimitResult.limit,
      remaining: rateLimitResult.remaining,
      retryAfter: rateLimitResult.retryAfter,
    });

    return NextResponse.json(
      {
        error: "Too many submissions. Please slow down and try again.",
        retryAfter: rateLimitResult.retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimitResult.retryAfter),
          "X-RateLimit-Limit": String(rateLimitResult.limit),
          "X-RateLimit-Remaining": String(rateLimitResult.remaining),
        },
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (parseError) {
    reqLogger.warn("Malformed JSON request body received", { error: parseError });
    return NextResponse.json(
      { error: "Invalid JSON request body" },
      { status: 400 }
    );
  }

  const { code, language, stdin, problemId } = (body as Record<string, unknown>) || {};

  // 2. Validate required fields
  if (
    typeof code !== "string" ||
    !code.trim() ||
    typeof language !== "string" ||
    !language.trim()
  ) {
    reqLogger.warn("Request validation failed: missing required code or language", {
      hasCode: Boolean(code),
      hasLanguage: Boolean(language),
    });
    return NextResponse.json(
      { error: "Missing required fields: 'code' and 'language' are required" },
      { status: 400 }
    );
  }

  const normalizedLanguage = language.trim().toLowerCase();
  const codeByteLength = Buffer.byteLength(code, "utf8");

  // 3. Validate supported language
  if (!SUPPORTED_LANGUAGES.includes(normalizedLanguage)) {
    reqLogger.warn("Request validation failed: unsupported language requested", {
      requestedLanguage: language,
      codeByteLength,
    });
    return NextResponse.json(
      {
        error: `Unsupported language: '${language}'. Supported languages are: ${SUPPORTED_LANGUAGES.join(
          ", "
        )}`,
      },
      { status: 400 }
    );
  }

  let submissionId: string | undefined;

  try {
    // 4. Persist initial queued submission in PostgreSQL
    const submission = await prisma.submission.create({
      data: {
        code,
        language: normalizedLanguage,
        stdin: typeof stdin === "string" && stdin.trim() ? stdin : null,
        status: "queued",
        problemId: problemId ? Number(problemId) : null,
      },
    });

    submissionId = submission.id;
    const subLogger = reqLogger.child({ submissionId });

    subLogger.info("Submission successfully recorded in database", {
      language: normalizedLanguage,
      codeByteLength,
      hasStdin: Boolean(stdin),
      problemId: problemId ? Number(problemId) : null,
    });

    // 4. Enqueue job into BullMQ
    try {
      const job = await submissionQueue.add("execute", {
        submissionId: submission.id,
      });

      subLogger.info("Job successfully enqueued to BullMQ", {
        jobId: job.id,
        queueName: submissionQueue.name,
      });

      return NextResponse.json({
        submissionId: submission.id,
      });
    } catch (queueError) {
      // 5. Handle enqueue failure: prevent submission from remaining stuck in 'queued' forever
      subLogger.error("Failed to enqueue submission to BullMQ", queueError);

      try {
        await prisma.submission.update({
          where: { id: submission.id },
          data: {
            status: "error",
            verdict: "System Error",
            stderr:
              "Execution service temporarily unavailable. Failed to schedule job.",
            completedAt: new Date(),
          },
        });
      } catch (dbUpdateError) {
        subLogger.error(
          "Failed to transition orphan submission to error state in database",
          dbUpdateError
        );
      }

      return NextResponse.json(
        { error: "Failed to schedule code execution. Please try again." },
        { status: 503 }
      );
    }
  } catch (error) {
    reqLogger.error("Internal error during submission processing", error, {
      submissionId,
    });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}