"use client";

import React from "react";

type SubmissionStatus = "idle" | "pending" | "running" | "completed" | "error";

interface OutputPanelProps {
  output: string;
  stderr: string;
  status: SubmissionStatus;
  dispatchError?: string | null;
  execTime?: number | null;
}

export default function OutputPanel({
  output,
  stderr,
  status,
  dispatchError,
}: OutputPanelProps) {
  const isTimeLimit =
    stderr.includes("Time Limit Exceeded") ||
    stderr.toLowerCase().includes("timed out");
  const isCompilationError =
    stderr.toLowerCase().includes("compilation error") ||
    stderr.toLowerCase().includes("compilation failed") ||
    stderr.includes("SyntaxError");
  const isRuntimeError =
    !isTimeLimit &&
    !isCompilationError &&
    (status === "error" || (status === "completed" && !!stderr));

  return (
    <div className="cc-output-wrapper">
      <div className="cc-output-header">
        <h2 className="cc-output-heading">Output</h2>
      </div>

      <div className="cc-output-box" role="region" aria-live="polite">
        {/* Loading status */}
        {(status === "pending" || status === "running") && (
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

        {/* Specific error verdicts */}
        {isTimeLimit && (
          <div className="cc-output-status-label timeout">
            Time Limit Exceeded (5.0s)
          </div>
        )}

        {isCompilationError && (
          <div className="cc-output-status-label error">
            Compilation Error
          </div>
        )}

        {isRuntimeError && (
          <div className="cc-output-status-label error">
            Runtime Error
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
      </div>
    </div>
  );
}


