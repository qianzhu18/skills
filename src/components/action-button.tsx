"use client";

import type { ReactNode } from "react";

type ActionButtonProps = {
  label: string;
  icon?: ReactNode;
  busy?: boolean;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "ghost" | "danger";
  size?: "default" | "compact";
  onClick: () => void;
};

export function ActionButton({
  label,
  icon,
  busy = false,
  disabled = false,
  tone = "primary",
  size = "default",
  onClick,
}: ActionButtonProps) {
  const toneClass =
    tone === "primary"
      ? "action-button-primary"
      : tone === "danger"
        ? "action-button-danger"
      : tone === "secondary"
        ? "action-button-secondary"
        : "action-button-ghost";
  const sizeClass = size === "compact" ? "action-button-compact" : "";

  return (
    <button
      type="button"
      className={`action-button ${toneClass} ${sizeClass}`}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span>{busy ? "处理中…" : label}</span>
    </button>
  );
}
