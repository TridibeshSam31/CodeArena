"use client";

import React, { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

export interface EditorSettings {
  theme: string;
  tabSize: number;
  fontSize: number;
  softWrap: boolean;
  autocomplete: boolean;
}

interface EditorSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: EditorSettings;
  onUpdateSettings: (newSettings: Partial<EditorSettings>) => void;
}

const emptySubscribe = () => () => {};

export default function EditorSettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}: EditorSettingsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const handleFontSizeChange = (delta: number) => {
    const next = Math.min(Math.max(settings.fontSize + delta, 11), 22);
    onUpdateSettings({ fontSize: next });
  };

  const modalNode = (
    <div
      className="cc-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="editor-settings-title"
    >
      <div className="cc-modal-content" ref={modalRef}>
        {/* Header */}
        <div className="cc-modal-header">
          <h2 id="editor-settings-title" className="cc-modal-title">
            Editor Settings
          </h2>
          <button
            type="button"
            className="cc-modal-close-btn"
            onClick={onClose}
            aria-label="Close Editor Settings"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="cc-modal-body">
          {/* 1. Theme */}
          <div className="cc-setting-row">
            <div className="cc-setting-info">
              <span className="cc-setting-label">Theme</span>
              <span className="cc-setting-desc">
                Tired of the white background? Try different styles and syntax highlighting.
              </span>
            </div>
            <div className="cc-setting-control">
              <div className="cc-modal-select-wrapper">
                <select
                  className="cc-modal-select"
                  value={settings.theme}
                  onChange={(e) => onUpdateSettings({ theme: e.target.value })}
                  aria-label="Editor Theme"
                >
                  <option value="codechef-dark">Tomorrow Night</option>
                  <option value="vs-dark">VS Dark</option>
                  <option value="light">Light</option>
                </select>
                <span className="cc-modal-select-chevron" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </div>
            </div>
          </div>

          {/* 2. Tab Size */}
          <div className="cc-setting-row">
            <div className="cc-setting-info">
              <span className="cc-setting-label">Tab Size</span>
              <span className="cc-setting-desc">
                Choose the width of a tab character.
              </span>
            </div>
            <div className="cc-setting-control">
              <div className="cc-modal-select-wrapper">
                <select
                  className="cc-modal-select"
                  value={settings.tabSize}
                  onChange={(e) => onUpdateSettings({ tabSize: Number(e.target.value) })}
                  aria-label="Tab Size"
                >
                  <option value={2}>2 spaces</option>
                  <option value={4}>4 spaces</option>
                  <option value={8}>8 spaces</option>
                </select>
                <span className="cc-modal-select-chevron" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </div>
            </div>
          </div>

          {/* 3. Font Size */}
          <div className="cc-setting-row">
            <div className="cc-setting-info">
              <span className="cc-setting-label">Font Size</span>
              <span className="cc-setting-desc">
                Choose your preferred font size for the code editor.
              </span>
            </div>
            <div className="cc-setting-control">
              <div className="cc-stepper">
                <button
                  type="button"
                  className="cc-stepper-btn"
                  onClick={() => handleFontSizeChange(-1)}
                  disabled={settings.fontSize <= 11}
                  aria-label="Decrease Font Size"
                >
                  -
                </button>
                <span className="cc-stepper-value">{settings.fontSize}</span>
                <button
                  type="button"
                  className="cc-stepper-btn"
                  onClick={() => handleFontSizeChange(1)}
                  disabled={settings.fontSize >= 22}
                  aria-label="Increase Font Size"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* 4. Toggles (Soft Wrap & Autocomplete) */}
          <div className="cc-toggles-row">
            <label className="cc-toggle-item">
              <span className="cc-toggle-label">Soft Wrap</span>
              <input
                type="checkbox"
                className="cc-checkbox"
                checked={settings.softWrap}
                onChange={(e) => onUpdateSettings({ softWrap: e.target.checked })}
              />
            </label>

            <label className="cc-toggle-item">
              <span className="cc-toggle-label">Autocomplete</span>
              <input
                type="checkbox"
                className="cc-checkbox"
                checked={settings.autocomplete}
                onChange={(e) => onUpdateSettings({ autocomplete: e.target.checked })}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalNode, document.body);
}
