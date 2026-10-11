
// Queue se jobs process karni hain:
// 1. Fetch submission from DB
// 2. Update status to running
// 3. Execute code
// 4. Update DB with result
// 5. Handle worker failures and retries

import { Worker } from "bullmq";
import { prisma } from "./prisma";
import executeCode from "./executor";

const worker = new Worker(
  "submission-queue",
  async (job) => {
    const { submissionId } = job.data;

    // 1. Fetch submission from DB
    const submission = await prisma.submission.findUnique({
      where: {
        id: submissionId,
      },
    });

    if (!submission) {
      console.error(`Submission not found for ID: ${submissionId}`);
      return;
    }

    // 2. Update status to running and clear prior execution state
    await prisma.submission.update({
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
    });

    // 3. Execute code inside the Docker sandbox
    const result = await executeCode({
      code: submission.code,
      language: submission.language,
      input: submission.stdin ?? "",
    });

    // 4. Persist execution result in DB
    await prisma.submission.update({
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
    });
  },
  {
    connection: {
      url: process.env.REDIS_URL!,
      maxRetriesPerRequest: null,
    },
  }
);

// Handle jobs that throw an error
worker.on("failed", async (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);

  // A missing job means there is no submission ID to update.
  if (!job?.data?.submissionId) {
    return;
  }

  // If more attempts remain, let BullMQ retry the job.
  const maxAttempts = job.opts.attempts ?? 1;

  if (job.attemptsMade < maxAttempts) {
    console.error(
      `Job ${job.id} failed. Attempt ${job.attemptsMade}/${maxAttempts}; retry may follow.`
    );
    return;
  }

  // All configured attempts have failed.
  // Persist the final failure in the database.
  try {
    await prisma.submission.update({
      where: {
        id: job.data.submissionId,
      },
      data: {
        status: "error",
        verdict: "Execution Error",
        stderr: err.message || "Execution job encountered a critical worker error.",
        output: null,
        completedAt: new Date(),
      },
    });
  } catch (dbError) {
    console.error(
      "Failed to persist final submission failure:",
      dbError
    );
  }
});

console.log("Worker started — listening for jobs...");
