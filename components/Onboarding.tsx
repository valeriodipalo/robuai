"use client";

import { useState } from "react";
import type { VoiceId } from "@/lib/types";
import { VoiceCards } from "./VoicePicker";
import { StatusBar } from "./ui";

export interface OnboardingValues {
  voiceId: VoiceId;
  ageRange: string;
  intent: string;
  interests: string[];
}

const AGE_RANGES = ["18-24", "25-34", "35+"];

// Two-step setup: pick a voice, then quick taps for age / intent / interests.
export default function Onboarding({
  onDone,
  busy,
  error,
}: {
  onDone: (v: OnboardingValues) => void;
  busy?: boolean;
  error?: string | null;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [voiceId, setVoiceId] = useState<VoiceId | null>(null);
  const [ageRange, setAgeRange] = useState<string>("25-34");
  const [intent, setIntent] = useState<string>("dating");
  const [interestText, setInterestText] = useState<string>("");

  function submit() {
    if (!voiceId) return;
    const interests = interestText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    onDone({ voiceId, ageRange, intent, interests });
  }

  return (
    <div className="flex min-h-[100dvh] flex-col px-1 pb-8 pt-4">
      <StatusBar />

      {step === 1 ? (
        <div className="mt-[22px] flex flex-1 flex-col">
          <div className="text-[11px] font-semibold uppercase tracking-[.16em] text-ember-2">
            Setup · 1 of 2
          </div>
          <h2 className="mt-2 font-display text-[27px] font-medium leading-[1.05]">
            How do you talk?
          </h2>
          <p className="mt-[9px] text-[13.5px] leading-[1.5] text-muted">
            Pick the voice closest to you. We sharpen it every time you tweak a
            reply.
          </p>

          <VoiceCards value={voiceId} onChange={setVoiceId} />

          <button
            type="button"
            disabled={!voiceId}
            onClick={() => setStep(2)}
            className="ember-btn mt-auto rounded-[16px] py-[15px] text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue →
          </button>
        </div>
      ) : (
        <div className="mt-[22px] flex flex-1 flex-col">
          <div className="text-[11px] font-semibold uppercase tracking-[.16em] text-ember-2">
            Setup · 2 of 2
          </div>
          <h2 className="mt-2 font-display text-[27px] font-medium leading-[1.05]">
            A little about you
          </h2>
          <p className="mt-[9px] text-[13.5px] leading-[1.5] text-muted">
            Helps the reply land. Tap what fits.
          </p>

          <div className="mt-7">
            <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-faint">
              Age range
            </div>
            <div className="mt-3 flex gap-2">
              {AGE_RANGES.map((a) => (
                <Chip key={a} on={ageRange === a} onClick={() => setAgeRange(a)}>
                  {a}
                </Chip>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-faint">
              Looking for
            </div>
            <div className="mt-3 flex gap-2">
              <Chip on={intent === "casual"} onClick={() => setIntent("casual")}>
                Casual
              </Chip>
              <Chip on={intent === "dating"} onClick={() => setIntent("dating")}>
                Dating
              </Chip>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-faint">
              Interests
            </div>
            <input
              value={interestText}
              onChange={(e) => setInterestText(e.target.value)}
              placeholder="climbing, vinyl, ramen…"
              className="mt-3 w-full rounded-[16px] border border-white/[.1] bg-white/[.03] px-4 py-[13px] text-[14px] text-[#f4eef0] outline-none placeholder:text-faint focus:border-white/25"
            />
            <p className="mt-2 text-[11.5px] text-faint">Comma-separated, optional.</p>
          </div>

          {error && (
            <p className="mt-4 rounded-[12px] border border-[rgba(255,106,91,.4)] bg-[rgba(255,106,91,.08)] px-3 py-2 text-[12.5px] text-rose">
              {error}
            </p>
          )}

          <div className="mt-auto flex gap-3 pt-6">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="ghost-btn w-[56px] rounded-[16px] py-[15px] text-[15px]"
            >
              ←
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="ember-btn flex-1 rounded-[16px] py-[15px] text-[15px] font-semibold disabled:opacity-60"
            >
              {busy ? "Setting up…" : "Start →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-[15px] py-[9px] text-[13px] font-medium transition ${
        on
          ? "border-transparent text-[#1c0f0a] shadow-[0_10px_24px_-14px_rgba(255,106,91,.6)]"
          : "border-white/[.12] bg-white/[.02] text-muted hover:border-white/25"
      }`}
      style={
        on
          ? { background: "linear-gradient(120deg,#ff6a5b,#ffae5c)" }
          : undefined
      }
    >
      {children}
    </button>
  );
}
