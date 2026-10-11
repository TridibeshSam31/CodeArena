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

interface VerdictDetails {
  heading: string;
  badgeClass: "accepted" | "error" | "timeout" | "system" | "neutral";
  summary?: string;
}

function resolveVerdictDetails(
  verdict: string | null | undefined,
  status: SubmissionStatus
): VerdictDetails | null {
  if (status === "idle" || status === "pending" || status === "running") {
    return null;
  }

  const v = (verdict || "").trim();
  const lower = v.toLowerCase();

  if (lower === "accepted" || (!v && status === "completed")) {
    return {
      heading: "Accepted",
      badgeClass: "accepted",
      summary: "Program executed successfully.",
    };
  }

  if (lower.includes("compilation error")) {
    return {
      heading: "Compilation Error",
      badgeClass: "error",
      summary: "Code failed to compile. See compiler diagnostics below.",
    };
  }

  if (lower.includes("time limit") || lower.includes("timeout")) {
    return {
      heading: "Time Limit Exceeded",
      badgeClass: "timeout",
      summary: "Program exceeded the execution time limit (3.0s).",
    };
  }

  if (lower.includes("output limit")) {
    return {
      heading: "Output Limit Exceeded",
      badgeClass: "timeout",
      summary: "Program output exceeded the maximum allowed limit (1 MiB).",
    };
  }

  if (lower.includes("runtime error")) {
    return {
      heading: "Runtime Error",
      badgeClass: "error",
      summary: "Program terminated abnormally or encountered an unhandled exception.",
    };
  }

  if (lower.includes("unsupported")) {
    return {
      heading: "Unsupported Language",
      badgeClass: "error",
      summary: "The specified programming language is not supported.",
    };
  }

  if (lower.includes("execution error") || lower.includes("system") || (!v && status === "error")) {
    return {
      heading: "Execution Error",
      badgeClass: "system",
      summary: "The sandbox execution environment encountered an error.",
    };
  }

  return {
    heading: v,
    badgeClass: status === "error" ? "error" : "neutral",
  };
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
  const verdictDetails = resolveVerdictDetails(verdict, status);

  const hasMetadata =
    (executionTimeMs !== undefined && executionTimeMs !== null) ||
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
            {status === "pending" ? "Queued for execution..." : "Executing inside sandbox..."}
          </div>
        )}

        {/* Dispatch or network failure */}
        {dispatchError && (
          <div className="cc-dispatch-alert">
            <strong>Submission Failed:</strong> {dispatchError}
          </div>
        )}

        {/* Structured execution verdict heading & summary */}
        {!isRunning && verdictDetails && (
          <div className="cc-verdict-header">
            <div className={`cc-output-status-label ${verdictDetails.badgeClass}`}>
              {verdictDetails.heading}
            </div>
            {verdictDetails.summary && (
              <p className="cc-verdict-summary">{verdictDetails.summary}</p>
            )}
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

        {/* Stderr / Compiler Diagnostics Stream */}
        {stderr && (
          <div className="cc-output-stream-container">
            <div className="cc-stream-label error">
              {verdictDetails?.heading === "Compilation Error"
                ? "Compiler Diagnostics:"
                : "Standard Error / Diagnostics:"}
            </div>
            <pre className="cc-output-pre error">{stderr}</pre>
          </div>
        )}

        {/* Stdout stream */}
        {output && (
          <div className="cc-output-stream-container">
            {stderr && <div className="cc-stream-label">Standard Output:</div>}
            <pre className="cc-output-pre">{output}</pre>
          </div>
        )}

        {/* Clean empty notification if completed with no streams */}
        {!isRunning && status === "completed" && !output && !stderr && !dispatchError && (
          <div className="cc-output-empty">Program finished with no output.</div>
        )}

        {/* Empty streams on error status */}
        {!isRunning && status === "error" && !output && !stderr && !dispatchError && (
          <div className="cc-output-empty">Execution terminated with no output or diagnostics.</div>
        )}
      </div>
    </div>
  );
}
