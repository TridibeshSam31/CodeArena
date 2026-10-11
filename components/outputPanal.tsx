"use client";

import React from "react";

type SubmissionStatus = "idle" | "pending" | "running" | "completed" | "error";

export interface OutputPanelProps {
  output: string;
  stderr: string;
  status: SubmissionStatus;
  verdict?: string | null;
  exitCode?: number | null;
  executionTimeMs?: number | null;
  dispatchError?: string | null;
  execTime?: number | null;
}

function getVerdictClass(verdict: string): "accepted" | "error" | "timeout" | "neutral" {
  const normalized = verdict.toLowerCase().trim();
  if (normalized === "accepted") {
    return "accepted";
  }
  if (
    normalized.includes("time limit") ||
    normalized.includes("timeout") ||
    normalized.includes("memory limit")
  ) {
    return "timeout";
  }
  if (
    normalized.includes("error") ||
    normalized.includes("failed") ||
    normalized.includes("wrong answer")
  ) {
    return "error";
  }
  return "neutral";
}

export default function OutputPanel({
  output,
  stderr,
  status,
  verdict,
  exitCode,
  executionTimeMs,
  dispatchError,
  execTime,
}: OutputPanelProps) {
  const isRunning = status === "pending" || status === "running";
  const hasMetadata =
    executionTimeMs !== undefined && executionTimeMs !== null ||
    (exitCode !== undefined && exitCode !== null) ||
    (!isRunning && execTime !== null && execTime !== undefined);

  return (
    <div className="cc-output-wrapper">
      <div className="cc-output-header">
        <h2 className="cc-output-heading">Output</h2>
      </div>

      <div className="cc-output-box" role="region" aria-live="polite">
        {/* Loading status */}
        {isRunning && (
          <div className="cc-output-status-label timeout">
            {status === "pending" ? "Queued for execution..." : "Executing program..."}
          </div>
        )}

        {/* Dispatch or network failure */}
        {dispatchError && (
          <div className="cc-dispatch-alert">
            <strong>Submission Failed:</strong> {dispatchError}
          </div>
        )}

        {/* Structured execution verdict if provided by backend */}
        {verdict && (
          <div className={`cc-output-status-label ${getVerdictClass(verdict)}`}>
            {verdict}
          </div>
        )}

        {/* Execution metadata row: time & exit code */}
        {!isRunning && status !== "idle" && hasMetadata && (
          <div className="cc-output-meta">
            {executionTimeMs !== null && executionTimeMs !== undefined ? (
              <span className="cc-meta-badge">Time: {executionTimeMs} ms</span>
            ) : execTime !== null && execTime !== undefined ? (
              <span className="cc-meta-badge">Elapsed: {execTime} ms</span>
            ) : null}

            {exitCode !== null && exitCode !== undefined && (
              <span
                className={`cc-meta-badge ${exitCode !== 0 ? "exit-nonzero" : ""}`}
              >
                Exit code: {exitCode}
              </span>
            )}
          </div>
        )}

        {/* Stderr stream */}
        {stderr && (
          <pre className="cc-output-pre error">{stderr}</pre>
        )}

        {/* Stdout stream */}
        {output && (
          <pre className="cc-output-pre">{output}</pre>
        )}

        {/* Clean empty notification if completed with no streams */}
        {status === "completed" && !output && !stderr && !dispatchError && (
          <div className="cc-output-empty">Program finished with no output.</div>
        )}
      </div>
    </div>
  );
}


