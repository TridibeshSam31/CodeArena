"use client";
import React from "react";

type SubmissionStatus = "idle" | "pending" | "running" | "completed" | "error";

interface HeaderProps {
  status: SubmissionStatus;
  execTime: number | null;
}

const Header = ({ status, execTime }: HeaderProps) => {
  return (
    <header className="arena-header">
      <div className="arena-logo">
        <span className="arena-logo-bracket">{"{"}</span>
        <span className="arena-logo-text">CodeArena</span>
        <span className="arena-logo-bracket">{"}"}</span>
      </div>
      <div className="arena-header-center">
        <div className="arena-status-dot" data-status={status} />
        <span className="arena-status-text">
          {status === "idle" && "Ready"}
          {status === "pending" && "Queued..."}
          {status === "running" && "Executing..."}
          {status === "completed" && "Completed"}
          {status === "error" && "Error"}
        </span>
        {execTime && status !== "idle" && (
          <span className="arena-exec-time">{(execTime / 1000).toFixed(2)}s</span>
        )}
      </div>
      <div className="arena-header-right">
        <span className="arena-version">v1.0</span>
      </div>
    </header>
  );
};

export default Header;