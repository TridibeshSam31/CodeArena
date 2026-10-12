
import { Worker } from "bullmq";
import { prisma, withDbRetry } from "./prisma";
import executeCode, { sweepOrphanContainers } from "./executor";
import { logger } from "./logger";

const workerLogger = logger.child({ service: "worker" });

const worker = new Worker(
  "submission-queue",
  async (job) => {
    const { submissionId } = job.data;
    const jobLogger = workerLogger.child({
      submissionId,
      jobId: job.id,
    });

    jobLogger.info("Job received from queue", {
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts ?? 1,
    });

    // 1. Fetch submission from DB with bounded retry for transient DB errors
    const submission = await withDbRetry(
      () =>
        prisma.submission.findUnique({
          where: {
            id: submissionId,
          },
        }),
      {
        operationName: "fetch_submission",
        context: { submissionId, jobId: job.id },
      }
    );

    if (!submission) {
      jobLogger.error("Submission record not found in database; aborting job processing");
      return;
    }

    // 2. Update status to running and clear prior execution state
    jobLogger.info("Transitioning submission status to running");
    await withDbRetry(
      () =>
        prisma.submission.update({
          where: {
            id: submissionId,
          },
          data: {
            status: "running",
            startedAt: new Date(),
            completedAt: null,
            verdict: null,
            exitCode: null,
            executionTimeMs: null,
            output: null,
            stderr: null,
          },
        }),
      {
        operationName: "mark_submission_running",
        context: { submissionId, jobId: job.id },
      }
    );

    // 3. Execute code inside the Docker sandbox
    jobLogger.info("Starting sandbox code execution", {
      language: submission.language,
      codeByteLength: Buffer.byteLength(submission.code, "utf8"),
      hasStdin: Boolean(submission.stdin),
    });

    const result = await executeCode({
      code: submission.code,
      language: submission.language,
      input: submission.stdin ?? "",
      submissionId,
      jobId: job.id,
    });

    jobLogger.info("Sandbox code execution finished", {
      verdict: result.verdict,
      exitCode: result.exitCode,
      executionTimeMs: result.executionTimeMs,
      success: result.success,
    });

    // 4. Persist execution result in DB with retry
    try {
      await withDbRetry(
        () =>
          prisma.submission.update({
            where: {
              id: submissionId,
            },
            data: {
              status: result.success ? "completed" : "error",
              output: result.stdout,
              stderr: result.stderr,
              verdict: result.verdict,
              exitCode: result.exitCode,
              executionTimeMs: result.executionTimeMs,
              startedAt: result.startedAt,
              completedAt: result.completedAt,
            },
          }),
        {
          operationName: "persist_submission_result",
          context: { submissionId, jobId: job.id },
        }
      );

      jobLogger.info("Execution result successfully persisted to database", {
        status: result.success ? "completed" : "error",
        verdict: result.verdict,
      });
    } catch (persistError) {
      jobLogger.error("Failed to persist execution result to database", persistError);
      throw persistError; // Rethrow to inform BullMQ of the failure
    }
  },
  {
    connection: {
      url: process.env.REDIS_URL!,
      maxRetriesPerRequest: null,
    },
    concurrency: 5,
    lockDuration: 30000,
    stalledInterval: 30000,
    maxStalledCount: 2,
  }
);

// Worker-level error listener
worker.on("error", (err) => {
  workerLogger.error("BullMQ worker operational error", err);
});

// Stalled-job event listener
worker.on("stalled", (jobId, prev) => {
  workerLogger.warn("Job stalled in queue; returning to wait queue for reprocessing", {
    jobId,
    previousState: prev,
  });
});

// Handle jobs that throw an error
worker.on("failed", async (job, err) => {
  const submissionId = job?.data?.submissionId;
  const failureLogger = workerLogger.child({
    submissionId,
    jobId: job?.id,
  });

  const maxAttempts = job?.opts.attempts ?? 1;
  const attemptsMade = job?.attemptsMade ?? 0;

  if (attemptsMade < maxAttempts) {
    failureLogger.warn("Job attempt failed; retry scheduled by BullMQ", {
      attempt: attemptsMade,
      maxAttempts,
      error: err.message,
    });
    return;
  }

  failureLogger.error("Job permanently failed: all retry attempts exhausted", err, {
    attemptsMade,
    maxAttempts,
  });

  // A missing job means there is no submission ID to update.
  if (!submissionId) {
    return;
  }

  // All configured attempts have failed. Persist final failure in the database with retry.
  try {
    await withDbRetry(
      () =>
        prisma.submission.update({
          where: {
            id: submissionId,
          },
          data: {
            status: "error",
            verdict: "Execution Error",
            stderr: err.message || "Execution job encountered a critical worker error.",
            output: null,
            completedAt: new Date(),
          },
        }),
      {
        operationName: "persist_final_failure",
        context: { submissionId, jobId: job?.id },
      }
    );
    failureLogger.info("Final execution failure persisted to database");
  } catch (dbError) {
    failureLogger.error("Failed to persist final submission failure to database", dbError);
  }
});

workerLogger.info("Worker initialized and listening for jobs", {
  queueName: "submission-queue",
  concurrency: 5,
});

// Reclaim any managed orphan containers left behind from prior ungraceful exits
void sweepOrphanContainers().catch((err) => {
  workerLogger.warn("Initial orphan container sweep encountered an error", err);
});

// Graceful shutdown handling for SIGINT and SIGTERM
let isShuttingDown = false;

async function handleShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  workerLogger.info(`Received ${signal}. Initiating graceful shutdown...`);

  try {
    // Stop accepting new jobs and allow in-flight work to finish
    await worker.close();
    workerLogger.info("BullMQ worker closed gracefully.");

    // Disconnect Prisma after worker shutdown
    await prisma.$disconnect();
    workerLogger.info("Database client disconnected.");

    process.exit(0);
  } catch (error) {
    workerLogger.error("Error during graceful worker shutdown", error);
    process.exit(1);
  }
}

process.once("SIGINT", () => void handleShutdown("SIGINT"));
process.once("SIGTERM", () => void handleShutdown("SIGTERM"));
