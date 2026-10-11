// Monaco editor integration for CodeArena matching reference layout
"use client";

import React, { useRef, useState } from "react";
import Editor, { Monaco, OnMount } from "@monaco-editor/react";
import EditorSettingsModal, { EditorSettings } from "./EditorSettingsModal";

interface CodeEditorProps {
  code: string;
  language: string;
  languages: Array<{ id: string; label: string }>;
  onLanguageChange: (langId: string) => void;
  onchange?: (code: string) => void;
  onChange?: (code: string) => void;
  onRun?: () => void;
  onReset?: () => void;
}

const LANGUAGE_MAP: Record<string, string> = {
  cpp: "cpp",
  c: "c",
  python: "python",
};

const DEFAULT_SETTINGS: EditorSettings = {
  theme: "codechef-dark",
  tabSize: 4,
  fontSize: 14,
  softWrap: false,
  autocomplete: true,
};

export default function CodeEditor({
  language,
  code,
  languages,
  onLanguageChange,
  onchange,
  onChange,
  onRun,
}: CodeEditorProps) {
  const onRunRef = useRef(onRun);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<EditorSettings>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("codearena_editor_settings");
        if (saved) {
          return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        }
      } catch {
        // Ignore
      }
    }
    return DEFAULT_SETTINGS;
  });

  React.useEffect(() => {
    onRunRef.current = onRun;
  }, [onRun]);

  const handleUpdateSettings = (newSettings: Partial<EditorSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem("codearena_editor_settings", JSON.stringify(updated));
      } catch {
        // Ignore
      }
      return updated;
    });
  };

  const handleEditorChange = (value: string | undefined) => {
    const val = value || "";
    if (onChange) onChange(val);
    if (onchange) onchange(val);
  };

  const handleBeforeMount = (monaco: Monaco) => {
    // Custom theme matching reference compiler surface
    monaco.editor.defineTheme("codechef-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "", foreground: "f1f3f5", background: "1c1d1f" },
        { token: "comment", foreground: "6e7681", fontStyle: "italic" },
        { token: "keyword", foreground: "58a6ff", fontStyle: "bold" },
        { token: "identifier", foreground: "f0f6fc" },
        { token: "string", foreground: "7ee787" },
        { token: "number", foreground: "d29922" },
        { token: "type", foreground: "79c0ff" },
        { token: "delimiter", foreground: "8b949e" },
      ],
      colors: {
        "editor.background": "#1c1d1f",
        "editor.foreground": "#f1f3f5",
        "editorLineNumber.foreground": "#555964",
        "editorLineNumber.activeForeground": "#a0a5ad",
        "editorCursor.foreground": "#58a6ff",
        "editor.selectionBackground": "#283548",
        "editor.inactiveSelectionBackground": "#1e2633",
        "editor.lineHighlightBackground": "#222428",
        "editorIndentGuide.background": "#26282e",
        "editorIndentGuide.activeBackground": "#343740",
        "editorWhitespace.foreground": "#282a30",
        "editorWidget.background": "#242529",
        "editorWidget.border": "#34363b",
      },
    });
  };

  const handleMount: OnMount = (editor, monaco) => {
    // Force full layout calculation to fill height immediately
    editor.layout();

    const handleResize = () => {
      editor.layout();
    };
    window.addEventListener("resize", handleResize);

    // Add Ctrl+Enter / Cmd+Enter shortcut inside editor to trigger run
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      if (onRunRef.current) {
        onRunRef.current();
      }
    });

    editor.onDidDispose(() => {
      window.removeEventListener("resize", handleResize);
    });
  };

  return (
    <div className="cc-editor-inner">
      {/* Editor Toolbar matching reference screenshot */}
      <div className="cc-editor-toolbar">
        <div className="cc-editor-toolbar-left">
          <div className="cc-lang-select-wrapper">
            <select
              className="cc-lang-select"
              value={language}
              onChange={(e) => onLanguageChange(e.target.value)}
              aria-label="Select Programming Language"
            >
              {languages.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
            <span className="cc-lang-select-chevron" aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </div>
        </div>

        <div className="cc-editor-toolbar-right">
          {/* Settings gear button matching CodeChef reference */}
          <button
            type="button"
            className="cc-icon-btn"
            onClick={() => setIsSettingsOpen(true)}
            title="Editor Settings"
            aria-label="Editor Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="cc-editor-body">
        <Editor
          height="100%"
          language={LANGUAGE_MAP[language] || language}
          value={code}
          onChange={handleEditorChange}
          beforeMount={handleBeforeMount}
          onMount={handleMount}
          theme={settings.theme}
          options={{
            automaticLayout: true,
            fontSize: settings.fontSize,
            lineHeight: Math.round(settings.fontSize * 1.55),
            fontFamily: "var(--font-mono), 'JetBrains Mono', Consolas, monospace",
            fontLigatures: true,
            tabSize: settings.tabSize,
            wordWrap: settings.softWrap ? "on" : "off",
            quickSuggestions: settings.autocomplete,
            suggestOnTriggerCharacters: settings.autocomplete,
            minimap: { enabled: false },
            bracketPairColorization: { enabled: true },
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            renderLineHighlight: "line",
            scrollBeyondLastLine: false,
            padding: { top: 12, bottom: 12 },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
          }}
        />
      </div>

      {/* Editor Settings Modal */}
      <EditorSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
      />
    </div>
  );
}