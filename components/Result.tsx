"use client";

import { useEffect, useRef, useState } from "react";
import type { ReplyResponse, VoiceId } from "@/lib/types";
import { getVoice } from "@/lib/voices";
import { StatusBar, StageBadge, Avatar } from "./ui";

const TRANS = "transform .34s cubic-bezier(.2,.8,.2,1), opacity .34s";
const THRESH = 90; // px to count as a swipe
const VEL = 0.5; // px/ms flick velocity
const DECK_H = 188; // uniform card height (Tinder-style), so cards stack cleanly

// The reply moment, as a Tinder-style card stack. Drag the top card left/right;
// past a threshold (or with a quick flick) it flings off and the next option is
// revealed underneath. Swipe right or tap ↩ to go back. Copy records the pick.
export default function Result({
  result,
  streaming,
  streamingReply,
  imageDataUrl,
  voiceId,
  onRegenerate,
  onNew,
  onBack,
  onSelect,
  onFeedback,
  regenerating,
}: {
  result: ReplyResponse | null;
  streaming?: boolean;
  streamingReply?: string;
  imageDataUrl: string | null;
  voiceId: VoiceId;
  onRegenerate: () => void;
  onNew: () => void;
  onBack: () => void;
  onSelect?: (turnId: string, index: number) => void;
  onFeedback?: (
    turnId: string,
    matchId: string | null,
    index: number,
    reply: string,
    score: -1 | 1,
  ) => void;
  regenerating?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [active, setActive] = useState(0);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const start = useRef({ x: 0, y: 0, t: 0 });
  const voice = getVoice(voiceId);

  const live = !result;
  const options = result?.options?.length
    ? result.options
    : [{ reply: streamingReply || "", why: "" }];
  const n = options.length;
  const idx = Math.min(active, n - 1);
  const current = options[idx] ?? options[0];
  const name = result?.matchName?.trim() || "New match";

  // If options shrink (regenerate), reset to the first card.
  useEffect(() => {
    if (active > n - 1) setActive(0);
  }, [n, active]);

  function onPointerDown(e: React.PointerEvent) {
    if (live || n <= 1) return;
    draggingRef.current = true;
    setDragging(true);
    start.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* capture is a nicety */
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    setDrag({ x: e.clientX - start.current.x, y: (e.clientY - start.current.y) * 0.5 });
  }
  function judge(score: -1 | 1) {
    if (result?.turnId && onFeedback) {
      onFeedback(result.turnId, result.matchId ?? null, idx, current?.reply ?? "", score);
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    const dx = e.clientX - start.current.x;
    const v = dx / Math.max(1, performance.now() - start.current.t);
    setDrag({ x: 0, y: 0 });
    // Left = reject (-1), right = like (+1). The swipe also navigates the deck.
    if (dx < -THRESH || v < -VEL) {
      judge(-1);
      if (idx < n - 1) setActive(idx + 1);
    } else if (dx > THRESH || v > VEL) {
      judge(1);
      if (idx > 0) setActive(idx - 1);
    }
  }

  function goBack() {
    if (idx > 0) setActive(idx - 1);
  }

  function cardStyle(i: number): React.CSSProperties {
    const delta = i - idx;
    if (delta === 0) {
      return {
        transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x * 0.06}deg)`,
        opacity: 1,
        zIndex: 30,
        transition: dragging ? "none" : TRANS,
        touchAction: "pan-y",
        cursor: !live && n > 1 ? (dragging ? "grabbing" : "grab") : "default",
      };
    }
    if (delta < 0) {
      return {
        transform: "translateX(-140%) rotate(-14deg)",
        opacity: 0,
        zIndex: 10,
        transition: TRANS,
        pointerEvents: "none",
      };
    }
    if (delta === 1) {
      return {
        transform: "translateY(12px) scale(.94)",
        opacity: 0.55,
        zIndex: 20,
        transition: TRANS,
        pointerEvents: "none",
      };
    }
    return {
      transform: "translateY(22px) scale(.9)",
      opacity: 0,
      zIndex: 5,
      transition: TRANS,
      pointerEvents: "none",
    };
  }

  async function copy() {
    const text = current?.reply ?? "";
    if (!text) return;
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.readOnly = true;
        ta.style.position = "fixed";
        ta.style.top = "0";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, text.length);
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (result?.turnId && onSelect) onSelect(result.turnId, idx);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  // direction hint while dragging
  const hintNext = drag.x < -16 ? Math.min(1, -drag.x / 90) : 0;
  const hintBack = drag.x > 16 && idx > 0 ? Math.min(1, drag.x / 90) : 0;

  return (
    <div className="flex min-h-[100dvh] flex-col px-1 pb-24 pt-4">
      <StatusBar />

      <div className="mt-4 flex items-center gap-2.5">
        <button
          type="button"
          onClick={onBack}
          className="grid h-[34px] w-[34px] place-items-center rounded-[11px] border border-white/[.08] bg-white/[.02] text-[15px] text-muted"
          aria-label="Back"
        >
          ←
        </button>
        <b className="text-[15px] font-semibold">{live ? "Your move" : name}</b>
      </div>

      {/* screenshot + stage */}
      <div className="mt-4 overflow-hidden rounded-[16px] border border-white/[.08] bg-black/30">
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2.5 text-[13px] font-semibold">
            <Avatar name={name} index={0} size={26} />
            {live ? "Reading her vibe…" : name}
          </div>
          {result && <StageBadge stage={result.stage} />}
        </div>
        {imageDataUrl && (
          <div className="border-t border-white/[.06]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageDataUrl}
              alt="Your screenshot"
              className="max-h-[150px] w-full object-cover opacity-90"
            />
          </div>
        )}
      </div>

      {result?.read && (
        <p className="mt-3 px-1 text-[12.5px] leading-[1.5] text-muted">{result.read}</p>
      )}

      {/* Tinder-style card stack */}
      <div className="relative mt-4" style={{ height: DECK_H }}>
        {options.map((opt, i) => {
          const isFront = i === idx;
          return (
            <div
              key={i}
              onPointerDown={isFront ? onPointerDown : undefined}
              onPointerMove={isFront ? onPointerMove : undefined}
              onPointerUp={isFront ? onPointerUp : undefined}
              onPointerCancel={isFront ? onPointerUp : undefined}
              className="absolute inset-x-0 top-0 flex select-none flex-col overflow-hidden rounded-[20px] p-[17px] shadow-[0_0_0_1.5px_rgba(255,106,91,.35),0_22px_46px_-26px_rgba(255,106,91,.5)]"
              style={{
                ...cardStyle(i),
                height: DECK_H,
                background:
                  "linear-gradient(160deg,rgba(255,106,91,.16),rgba(255,174,92,.06)), #160f1d",
              }}
            >
              {/* drag hints (only on the front card) */}
              {isFront && (
                <>
                  <span
                    className="pointer-events-none absolute right-3 top-3 rounded-full border border-ember-2/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ember-2"
                    style={{ opacity: hintNext }}
                  >
                    next →
                  </span>
                  <span
                    className="pointer-events-none absolute left-3 top-3 rounded-full border border-rose/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose"
                    style={{ opacity: hintBack }}
                  >
                    ← back
                  </span>
                </>
              )}
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[.1em] text-ember-2">
                <span>✶ {live ? "Your move" : `Option ${i + 1}`}</span>
                {!live && n > 1 && (
                  <span className="text-faint">
                    {i + 1}/{n}
                  </span>
                )}
              </div>
              <div className="flex flex-1 items-center">
                <p className="font-display text-[21px] font-medium leading-[1.34] tracking-[-.01em]">
                  {opt.reply}
                  {live && (
                    <span className="ml-0.5 inline-block h-[18px] w-[2px] translate-y-[3px] animate-pulse bg-ember-1 align-middle" />
                  )}
                </p>
              </div>
              <div className="text-[11.5px] text-faint">
                in your voice · {voice.name.replace(/^The /, "")}
                {opt.why ? ` · ${opt.why}` : ""}
              </div>
            </div>
          );
        })}
      </div>

      {/* dots + hint */}
      {!live && n > 1 && (
        <>
          <div className="mt-3 flex items-center justify-center gap-1.5">
            {options.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Option ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === idx ? "w-5 bg-ember-1" : "w-1.5 bg-white/25"
                }`}
              />
            ))}
          </div>
          <p className="mt-2 text-center text-[11px] text-faint">
            swipe the card · ↩ to go back
          </p>
        </>
      )}

      {/* actions: back · copy · regenerate */}
      <div className="mt-[14px] flex gap-[10px]">
        <button
          type="button"
          onClick={goBack}
          disabled={live || idx === 0}
          className="ghost-btn grid w-[52px] place-items-center rounded-[16px] text-[17px] disabled:opacity-30"
          aria-label="Go back to previous option"
        >
          ↩
        </button>
        <button
          type="button"
          onClick={copy}
          disabled={live}
          className="ember-btn flex-1 rounded-[16px] py-[13px] text-[15px] font-semibold disabled:opacity-50"
        >
          {live ? "Writing…" : copied ? "✓ Copied" : "⧉ Copy & send"}
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenerating || live}
          className="ghost-btn grid w-[52px] place-items-center rounded-[16px] text-[16px] disabled:opacity-50"
          aria-label="New options"
        >
          <span className={regenerating ? "inline-block animate-spin" : ""}>↻</span>
        </button>
      </div>

      <button
        type="button"
        onClick={onNew}
        className="mt-3 text-center text-[13px] text-muted underline-offset-2 hover:underline"
      >
        New screenshot
      </button>
    </div>
  );
}
