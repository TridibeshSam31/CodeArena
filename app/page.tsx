"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import OutputPanel from "@/components/outputPanal";
import CodeEditor from "@/components/CodeEditor";
import StdinInput from "@/components/stdinInput";
import Header from "@/components/Header";

const LANGUAGES = [
  { id: "cpp", label: "C++" },
  { id: "python", label: "Python" },
  { id: "c", label: "C" },
];

const DEFAULT_CODE: Record<string, string> = {
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    // your code goes here
    cout << "Hello, World!" << endl;
    return 0;
}`,
  c: `#include <stdio.h>
#include <stdlib.h>

int main() {
    // your code goes here
    printf("Hello, World!\\n");
    return 0;
}`,
  python: `# your code goes here
print("Hello, World!")`,
};

type SubmissionStatus = "idle" | "pending" | "running" | "completed" | "error";

export default function Home() {
  const [language, setLanguage] = useState("cpp");
  const [code, setCode] = useState(DEFAULT_CODE["cpp"]);
  const [stdin, setStdin] = useState("");
  const [output, setOutput] = useState("");
  const [stderr, setStderr] = useState("");
  const [verdict, setVerdict] = useState<string | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [executionTimeMs, setExecutionTimeMs] = useState<number | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [execTime, setExecTime] = useState<number | null>(null);
  const [status, setStatus] = useState<SubmissionStatus>("idle");
  const [splitPercent, setSplitPercent] = useState<number>(50);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const handleSubmitRef = useRef<() => void>(() => {});
  const workspaceRef = useRef<HTMLDivElement>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    pollCountRef.current = 0;
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const handleLanguageChange = (langId: string) => {
    setLanguage(langId);
    setCode(DEFAULT_CODE[langId] || "");
  };

  const handleResetCode = () => {
    if (
      code !== DEFAULT_CODE[language] &&
      !window.confirm("Reset editor to initial template?")
    ) {
      return;
    }
    setCode(DEFAULT_CODE[language]);
  };

  const handleSubmit = async () => {
    if (status === "running" || status === "pending") {
      return;
    }

    // Stop any existing polling before initiating new run
    stopPolling();

    setStatus("pending");
    setOutput("");
    setStderr("");
    setVerdict(null);
    setExitCode(null);
    setExecutionTimeMs(null);
    setDispatchError(null);
    setExecTime(null);
    startTimeRef.current = Date.now();
    pollCountRef.current = 0;

    try {
      const res = await fetch("/api/submit", {
        method: "post",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code,
          language,
          stdin,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        setStatus("error");
        setDispatchError(
          errorData.error || errorData.message || "Unable to queue execution request on server (HTTP " + res.status + ")."
        );
        return;
      }

      const { submissionId } = await res.json();

      pollingRef.current = setInterval(async () => {
        pollCountRef.current += 1;

        // Abort after 45s of waiting in queue
        if (pollCountRef.current > 38) {
          stopPolling();
          setStatus("error");
          setDispatchError("Execution job timed out waiting in queue after 45 seconds.");
          setExecTime(Date.now() - startTimeRef.current);
          return;
        }

        try {
          const pollRes = await fetch(`/api/submission/${submissionId}`);
          if (!pollRes.ok) {
            throw new Error(`Polling returned HTTP ${pollRes.status}`);
          }

          const data = await pollRes.json();

          if (data.status === "running") {
            setStatus("running");
          }

          if (data.status === "completed" || data.status === "error") {
            stopPolling();
            setStatus(data.status);
            setOutput(data.output || "");
            setStderr(data.stderr || "");
            setVerdict(data.verdict ?? null);
            setExitCode(data.exitCode ?? null);
            setExecutionTimeMs(data.executionTimeMs ?? null);
            setExecTime(
              data.executionTimeMs !== null && data.executionTimeMs !== undefined
                ? data.executionTimeMs
                : Date.now() - startTimeRef.current
            );
          }
        } catch {
          stopPolling();
          setStatus("error");
          setDispatchError("Network connection interrupted while checking execution status.");
        }
      }, 1200);
    } catch {
      setStatus("error");
      setDispatchError("Could not reach backend API server. Verify server is running.");
    }
  };

  handleSubmitRef.current = handleSubmit;

  // Global Ctrl+Enter / Cmd+Enter shortcut
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmitRef.current();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Draggable Split Divider Logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !workspaceRef.current) return;
      const rect = workspaceRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const rawPercent = (currentX / rect.width) * 100;
      // Clamp between 25% and 75%
      const clamped = Math.min(Math.max(rawPercent, 25), 75);
      setSplitPercent(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const isRunning = status === "pending" || status === "running";

  return (
    <div className="cc-app-shell">
      {/* 1. Header Navigation */}
      <Header status={status} execTime={execTime} />

      {/* 2. Page Heading Row */}
      <div className="cc-heading-row">
        <h1 className="cc-page-title">Online Compiler</h1>
      </div>

      {/* 3. Main Two-Column Workspace */}
      <main className="cc-workspace" ref={workspaceRef}>
        {/* Left Pane: Code Editor */}
        <section
          className="cc-editor-pane"
          style={{ width: `${splitPercent}%` }}
          aria-label="Code Editor"
        >
          <CodeEditor
            language={language}
            code={code}
            languages={LANGUAGES}
            onLanguageChange={handleLanguageChange}
            onChange={setCode}
            onRun={handleSubmit}
            onReset={handleResetCode}
          />
        </section>

        {/* Resizable Divider Handle */}
        <div
          className={`cc-divider ${isDragging ? "dragging" : ""}`}
          onMouseDown={() => setIsDragging(true)}
          role="separator"
          aria-valuenow={splitPercent}
          aria-label="Resize editor and output panels"
        >
          <div className="cc-divider-handle" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>

        {/* Right Pane: Run, Stdin, Output */}
        <aside
          className="cc-right-pane"
          style={{ width: `${100 - splitPercent}%` }}
          aria-label="Execution Controls and Output"
        >
          {/* A. Run Toolbar */}
          <div className="cc-run-toolbar">
            <button
              type="button"
              className="cc-run-btn"
              onClick={handleSubmit}
              disabled={isRunning}
              aria-label="Run Code"
            >
              {isRunning ? (
                <>
                  <span className="cc-spinner" aria-hidden="true" />
                  <span>Running...</span>
                </>
              ) : (
                <span>Run</span>
              )}
            </button>
          </div>

          {/* B. Standard Input (with C. Helper Text) */}
          <StdinInput value={stdin} onChange={setStdin} />

          {/* D. Execution Output */}
          <OutputPanel
            output={output}
            stderr={stderr}
            status={status}
            verdict={verdict}
            exitCode={exitCode}
            executionTimeMs={executionTimeMs}
            dispatchError={dispatchError}
            execTime={execTime}
          />
        </aside>
      </main>
    </div>
  );
}

/*
Full map of submission workflow:
User clicks RUN or presses Ctrl+Enter
↓
handleSubmit()
↓
status = pending
↓
POST /api/submit
↓
backend creates execution job in PostgreSQL & BullMQ queue
↓
backend returns submissionId
↓
frontend starts polling /api/submission/:id every 1.2 seconds
↓
GET /api/submission/id
↓
backend worker executes process in isolated environment
↓
backend returns output / stderr
↓
frontend stops polling and displays stdout / stderr
*/