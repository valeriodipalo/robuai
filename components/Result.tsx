"use client";

import { useRef, useState } from "react";
import type { ReplyResponse, VoiceId } from "@/lib/types";
import { getVoice } from "@/lib/voices";
import { StatusBar, StageBadge, Avatar } from "./ui";

// The reply moment. A horizontally swipeable deck of options (swipe left/right),
// each in serif; the user copies the one he likes and we record the pick. While
// the model streams the first option, it types out live with a caret.
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
  regenerating?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [active, setActive] = useState(0);
  const [dragDx, setDragDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  // Refs hold live drag state so the move/up handlers read current values
  // synchronously (React state would be stale within a single gesture).
  const draggingRef = useRef(false);
  const startX = useRef(0);
  const dxRef = useRef(0);
  const voice = getVoice(voiceId);

  const live = !result;
  const options = result?.options?.length
    ? result.options
    : [{ reply: streamingReply || "", why: "" }];
  const n = options.length;
  const idx = Math.min(active, n - 1);
  const current = options[idx] ?? options[0];
  const name = result?.matchName?.trim() || "New match";

  // Drag-to-swipe (pointer events → works with both touch and mouse).
  function onPointerDown(e: React.PointerEvent) {
    if (live || n <= 1) return;
    draggingRef.current = true;
    setDragging(true);
    startX.current = e.clientX;
    dxRef.current = 0;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // ignore — capture is a nicety, not required
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    let dx = e.clientX - startX.current;
    // resist past the first / last card
    if ((idx === 0 && dx > 0) || (idx === n - 1 && dx < 0)) dx *= 0.3;
    dxRef.current = dx;
    setDragDx(dx);
  }
  function onPointerUp() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    const dx = dxRef.current;
    dxRef.current = 0;
    const threshold = 48;
    if (dx < -threshold && idx < n - 1) setActive(idx + 1);
    else if (dx > threshold && idx > 0) setActive(idx - 1);
    setDragDx(0);
  }

  function goTo(i: number) {
    setActive(i);
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
    // record which option he kept
    if (result?.turnId && onSelect) onSelect(result.turnId, active);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

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

      {/* swipeable deck of options (drag left/right — touch or mouse) */}
      <div className="mt-4 overflow-hidden">
        <div
          className="flex select-none"
          style={{
            transform: `translateX(calc(${-idx * 100}% + ${dragDx}px))`,
            transition: dragging ? "none" : "transform .32s cubic-bezier(.2,.8,.2,1)",
            touchAction: "pan-y",
            cursor: !live && n > 1 ? (dragging ? "grabbing" : "grab") : "default",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {options.map((opt, i) => (
            <div key={i} className="w-full shrink-0 px-[1px]">
              <div
                className="rounded-[20px] p-[17px] shadow-[0_0_0_1.5px_rgba(255,106,91,.35),0_22px_46px_-26px_rgba(255,106,91,.5)]"
                style={{
                  background:
                    "linear-gradient(160deg,rgba(255,106,91,.14),rgba(255,174,92,.05))",
                }}
              >
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[.1em] text-ember-2">
                  <span>✶ {live ? "Your move" : `Option ${i + 1}`}</span>
                  {!live && n > 1 && (
                    <span className="text-faint">
                      {i + 1}/{n}
                    </span>
                  )}
                </div>
                <p className="mt-[11px] font-display text-[21px] font-medium leading-[1.34] tracking-[-.01em]">
                  {opt.reply}
                  {live && (
                    <span className="ml-0.5 inline-block h-[18px] w-[2px] translate-y-[3px] animate-pulse bg-ember-1 align-middle" />
                  )}
                </p>
                <div className="mt-[13px] text-[11.5px] text-faint">
                  in your voice · {voice.name.replace(/^The /, "")}
                  {opt.why ? ` · ${opt.why}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* dots — swipe between options */}
      {!live && options.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {options.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Option ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === idx ? "w-5 bg-ember-1" : "w-1.5 bg-white/25"
              }`}
            />
          ))}
        </div>
      )}
      {!live && options.length > 1 && (
        <p className="mt-2 text-center text-[11px] text-faint">swipe for other angles</p>
      )}

      <div className="mt-[14px] flex gap-[10px]">
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
