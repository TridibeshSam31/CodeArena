"use client";

import React from "react";

type SubmissionStatus = "idle" | "pending" | "running" | "completed" | "error";

interface HeaderProps {
  status: SubmissionStatus;
  execTime?: number | null;
  onResetCode?: () => void;
  onCopyCode?: () => void;
  copiedCode?: boolean;
}

export default function Header({
  status,
  execTime,
}: HeaderProps) {
  const isRunning = status === "pending" || status === "running";

  return (
    <header className="cc-top-header">
      {/* Brand & Compiler nav tab */}
      <div className="cc-header-left">
        <div className="cc-brand">
          <span className="cc-brand-badge" aria-hidden="true">
            &lt;/&gt;
          </span>
          <span>CodeArena</span>
        </div>

        <nav className="cc-header-nav" aria-label="Main Navigation">
          <span className="cc-nav-item">Compiler</span>
        </nav>
      </div>

      {/* Right side status if active */}
      <div className="cc-header-right">
        {isRunning && (
          <div className="cc-status-indicator">
            <span className="cc-status-dot running" />
            <span>{status === "pending" ? "Queued" : "Running..."}</span>
          </div>
        )}

        {execTime && status === "completed" && (
          <div className="cc-status-indicator">
            <span>{(execTime / 1000).toFixed(2)}s</span>
          </div>
        )}
      </div>
    </header>
  );
}