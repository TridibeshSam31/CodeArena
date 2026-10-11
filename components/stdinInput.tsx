"use client";

import React from "react";

export interface StdinInputProps {
  value?: string;
  onChange?: (val: string) => void;
  stdin?: string;
  onchange?: (val: string) => void;
}

export default function StdinInput({
  value,
  onChange,
  stdin,
  onchange,
}: StdinInputProps) {
  const currentValue = (value !== undefined ? value : stdin) || "";

  const handleChange = (newVal: string) => {
    if (onChange) onChange(newVal);
    if (onchange) onchange(newVal);
  };

  return (
    <div className="cc-stdin-wrapper">
      <textarea
        className="cc-stdin-textarea"
        value={currentValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Enter Input here"
        spellCheck={false}
        aria-label="Standard input"
      />
      <p className="cc-stdin-hint">
        If your code takes input, add it in the above box before running.
      </p>
    </div>
  );
}