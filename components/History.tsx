"use client";

import type { Match } from "@/lib/types";
import { StatusBar, StageTag, Avatar, relativeTime } from "./ui";

// The matches list. Tap a row to open the thread.
export default function History({
  matches,
  loading,
  onOpen,
  onNew,
}: {
  matches: Match[];
  loading?: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col px-1 pb-24 pt-4">
      <StatusBar />

      <div className="mt-4 flex items-center justify-between">
        <h2 className="font-display text-[27px] font-medium leading-[1.05]">
          Your matches
        </h2>
        <button
          type="button"
          onClick={onNew}
          className="grid h-[34px] w-[34px] place-items-center rounded-[11px] border border-white/[.08] bg-white/[.02] text-[15px] text-muted"
          aria-label="New"
        >
          ＋
        </button>
      </div>
      <p className="mt-[9px] text-[13.5px] leading-[1.5] text-muted">
        Pick up any chat — I remember the whole thread.
      </p>

      {loading ? (
        <p className="mt-10 text-center text-[13px] text-faint">Loading…</p>
      ) : matches.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <span
            className="grid h-[60px] w-[60px] place-items-center rounded-[20px] border border-white/[.1] text-[26px]"
            style={{
              background:
                "linear-gradient(150deg,rgba(255,106,91,.18),rgba(255,174,92,.1))",
            }}
          >
            💬
          </span>
          <p className="mt-4 font-display text-[18px]">No matches yet</p>
          <p className="mt-1.5 max-w-[26ch] text-[13px] text-muted">
            Drop your first screenshot and it&rsquo;ll show up here.
          </p>
          <button
            type="button"
            onClick={onNew}
            className="ember-btn mt-6 rounded-[16px] px-6 py-[12px] text-[14px] font-semibold"
          >
            Start a chat
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-[9px]">
          {matches.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onOpen(m.id)}
              className="flex items-center gap-3 rounded-[16px] border border-white/[.08] bg-white/[.02] p-[11px] text-left transition hover:border-white/[.16]"
            >
              <Avatar name={m.name ?? "New match"} index={i} size={40} />
              <div className="min-w-0 flex-1">
                <b className="text-[14px] font-semibold">
                  {m.name?.trim() || "New match"}
                </b>
                <p className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-muted">
                  {m.last_snippet || "Tap to continue"}
                </p>
              </div>
              <div className="flex flex-none flex-col items-end gap-1.5">
                <time className="text-[11px] text-faint">
                  {relativeTime(m.updated_at)}
                </time>
                <StageTag stage={m.last_stage} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
