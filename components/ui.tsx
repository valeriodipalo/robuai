"use client";

import type { Stage } from "@/lib/types";

// Small shared UI atoms used across the views. Keep these quiet so the
// one-reply card can sing.

/** Maps a detected stage to its human label + accent treatment. */
export function stageLabel(stage: Stage | null | undefined): string {
  switch (stage) {
    case "opener":
      return "Opener";
    case "escalate":
      return "Time to ask her out";
    case "reply":
    default:
      return "Her reply";
  }
}

/** Short tag label used in the history list. */
export function stageTag(stage: Stage | null | undefined): string {
  switch (stage) {
    case "opener":
      return "Opener";
    case "escalate":
      return "Date?";
    case "reply":
    default:
      return "Reply";
  }
}

export function StageBadge({ stage }: { stage: Stage | null | undefined }) {
  return (
    <span className="rounded-full border border-[rgba(255,174,92,.4)] bg-[rgba(255,174,92,.08)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[.06em] text-ember-2">
      {stageLabel(stage)}
    </span>
  );
}

export function StageTag({ stage }: { stage: Stage | null | undefined }) {
  const tone =
    stage === "opener"
      ? "text-ember-2 bg-[rgba(255,174,92,.1)]"
      : stage === "escalate"
        ? "text-ok bg-[rgba(118,227,176,.12)]"
        : "text-rose bg-[rgba(255,143,163,.12)]";
  return (
    <span
      className={`rounded-full px-[7px] py-[3px] text-[10px] font-semibold uppercase tracking-[.04em] ${tone}`}
    >
      {stageTag(stage)}
    </span>
  );
}

/** Gradient avatar circle with an initial, cycling through 3 ember tones. */
export function Avatar({
  name,
  index = 0,
  size = 40,
}: {
  name: string | null | undefined;
  index?: number;
  size?: number;
}) {
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();
  const grads = [
    "linear-gradient(140deg,#ff8fa3,#ff6a5b)",
    "linear-gradient(140deg,#ffae5c,#ffd27a)",
    "linear-gradient(140deg,#9b8cff,#ff8fa3)",
  ];
  return (
    <span
      className="grid flex-none place-items-center rounded-[14px] font-bold text-[#1c0f0a]"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: grads[index % grads.length],
      }}
    >
      {initial}
    </span>
  );
}

/** Compact relative time, e.g. "now", "2h", "3d". */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  return `${w}w`;
}

/** Phone status bar mimic from the mockup. */
export function StatusBar() {
  return (
    <div className="flex items-center justify-between px-1 pt-1.5 text-xs text-faint">
      <span>{"9:41"}</span>
      <span className="flex gap-1">
        <i className="block h-[5px] w-[5px] rounded-full bg-faint" />
        <i className="block h-[5px] w-[5px] rounded-full bg-faint" />
        <i className="block h-[5px] w-[5px] rounded-full bg-faint" />
      </span>
    </div>
  );
}
