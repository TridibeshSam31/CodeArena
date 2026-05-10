"use client"

import React from "react";

type SubmissionStatus = "idle" | "pending" | "running" | "completed" | "error";

interface OutputPanelProps{
   output: string;
   stderr: string;
   status:SubmissionStatus
}


const OutputPanel = ({output,stderr,status}:OutputPanelProps) => {
  return (
   <div className="arena-sub-panel arena-output-panel" data-status={status}>
      <div className="arena-panel-header">
        <div className="arena-panel-dots">
          <span /><span /><span />
        </div>
        <span className="arena-panel-title">output</span>
        {status === "completed" && !stderr && (
          <span className="arena-badge-success">✓ AC</span>
        )}
        {status === "error" || (status === "completed" && stderr) ? (
          <span className="arena-badge-error">✗ ERR</span>
        ) : null}
      </div>

      <div className="arena-output-body">
        {status === "idle" && (
          <div className="arena-output-empty">
            <span className="arena-empty-icon">⌨</span>
            <span>Run your code to see output</span>
          </div>
        )}
        {status === "running" && (
          <div className="arena-output-loading">
            <div className="arena-loader-bars">
              <span /><span /><span /><span /><span />
            </div>
            
            <span>{status === "pending" ? "Waiting in queue..." : "Executing code..."}</span>
          </div>
        )}
        {(status === "completed" || status === "error") && (
          <>
            {output && (
              <div className="arena-output-section">
                <span className="arena-output-label">stdout</span>
                <pre className="arena-output-pre">{output}</pre>
              </div>
            )}
            {stderr && (
              <div className="arena-output-section arena-output-error">
                <span className="arena-output-label">stderr / error</span>
                <pre className="arena-output-pre">{stderr}</pre>
              </div>
            )}
            {!output && !stderr && (
              <div className="arena-output-empty">
                <span className="arena-empty-icon">◎</span>
                <span>No output produced</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

}


export default OutputPanel;


