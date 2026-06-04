"use client";

import type { VoiceId } from "@/lib/types";
import { VOICE_LIST } from "@/lib/voices";

// The three voice cards. Reused by onboarding (inline) and the voice switcher
// sheet. The selected card glows ember.
export function VoiceCards({
  value,
  onChange,
}: {
  value: VoiceId | null;
  onChange: (id: VoiceId) => void;
}) {
  return (
    <div className="mt-[18px] flex flex-col gap-[11px]">
      {VOICE_LIST.map((v) => {
        const selected = v.id === value;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onChange(v.id)}
            className={`relative rounded-[18px] border p-[14px] text-left transition-all duration-200 ${
              selected
                ? "border-transparent shadow-[0_0_0_1.5px_#ff6a5b,0_18px_40px_-22px_rgba(255,106,91,.5)]"
                : "border-white/[.08] bg-white/[.02] hover:border-white/[.14]"
            }`}
            style={
              selected
                ? {
                    background:
                      "linear-gradient(160deg,rgba(255,106,91,.16),rgba(255,174,92,.07))",
                  }
                : undefined
            }
          >
            <div className="flex items-center gap-2 text-[14.5px] font-semibold">
              <span className="text-[15px]">{v.emoji}</span>
              {v.name}
            </div>
            <div className="mt-[9px] rounded-[12px_12px_12px_4px] border border-white/[.08] bg-black/25 px-[11px] py-[9px] text-[12.5px] leading-[1.45] text-muted">
              &ldquo;{v.example}&rdquo;
            </div>
            {selected && (
              <span
                className="absolute right-[14px] top-[13px] grid h-[22px] w-[22px] place-items-center rounded-full text-[13px] font-bold text-[#1a0f0c]"
                style={{
                  background:
                    "linear-gradient(150deg,#ff6a5b,#ffae5c)",
                }}
              >
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Bottom-sheet voice switcher used from the home chip and the Voice tab.
export function VoiceSheet({
  value,
  onPick,
  onClose,
  busy,
}: {
  value: VoiceId | null;
  onPick: (id: VoiceId) => void;
  onClose: () => void;
  busy?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-[430px] rounded-t-[28px] border-x border-t border-white/[.08] p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />
        <div className="text-[11px] font-semibold uppercase tracking-[.16em] text-ember-2">
          Your voice
        </div>
        <h2 className="mt-1.5 font-display text-[22px] font-medium leading-tight">
          How do you talk?
        </h2>
        <VoiceCards value={value} onChange={onPick} />
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="ghost-btn mt-4 w-full rounded-[16px] py-[13px] text-[15px] font-semibold disabled:opacity-60"
        >
          {busy ? "Saving…" : "Done"}
        </button>
      </div>
    </div>
  );
}
