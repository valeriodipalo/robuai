"use client";

import { useRef } from "react";
import type { VoiceId } from "@/lib/types";
import { getVoice } from "@/lib/voices";
import { StatusBar } from "./ui";

// Phone screenshots are 1-3MB; shrink to ~1280px JPEG before upload so the
// vision model's prefill (and the upload) stay fast. Text stays readable.
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
}

async function downscaleToDataUrl(file: File, maxDim = 1280, quality = 0.85): Promise<string> {
  const dataUrl = await readAsDataUrl(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("decode failed"));
      im.src = dataUrl;
    });
    const longest = Math.max(img.width, img.height);
    const scale = Math.min(1, maxDim / longest);
    // Already small enough — keep as-is.
    if (scale >= 1 && dataUrl.length < 400_000) return dataUrl;
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return dataUrl; // fallback to the original on any failure
  }
}

// Upload screen: dropzone / file input, voice chip, primary action. When
// continuing a thread, shows a small banner with the match name.
export default function Home({
  voiceId,
  imageDataUrl,
  onPickImage,
  onClearImage,
  onSubmit,
  onOpenVoice,
  continuingName,
  onCancelContinue,
  error,
}: {
  voiceId: VoiceId;
  imageDataUrl: string | null;
  onPickImage: (dataUrl: string) => void;
  onClearImage: () => void;
  onSubmit: () => void;
  onOpenVoice: () => void;
  continuingName?: string | null;
  onCancelContinue?: () => void;
  error?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const voice = getVoice(voiceId);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const url = await downscaleToDataUrl(file);
    onPickImage(url);
  }

  return (
    <div className="flex min-h-[100dvh] flex-col px-1 pb-24 pt-4">
      <StatusBar />

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="grid h-[22px] w-[22px] place-items-center rounded-[8px] text-[12px]"
            style={{ background: "linear-gradient(150deg,#ff6a5b,#ffae5c)" }}
          >
            🔥
          </span>
          <span className="text-[14px] font-semibold tracking-[.01em]">RobuAI</span>
        </div>
      </div>

      <h2 className="mt-6 font-display text-[27px] font-medium leading-[1.05]">
        What did she say?
      </h2>
      <p className="mt-[9px] text-[13.5px] leading-[1.5] text-muted">
        Drop a screenshot of her profile or your chat — I&rsquo;ll read it and find
        the move.
      </p>

      {continuingName && (
        <div className="mt-4 flex items-center justify-between rounded-[14px] border border-[rgba(255,174,92,.3)] bg-[rgba(255,174,92,.07)] px-3.5 py-2.5">
          <span className="text-[12.5px] text-ember-2">
            Continuing with <b className="font-semibold">{continuingName}</b>
          </span>
          {onCancelContinue && (
            <button
              type="button"
              onClick={onCancelContinue}
              className="text-[12px] text-muted underline-offset-2 hover:underline"
            >
              new
            </button>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {imageDataUrl ? (
        <div className="mt-[18px] flex flex-1 flex-col">
          <div className="relative overflow-hidden rounded-[24px] border border-white/[.1] bg-black/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageDataUrl}
              alt="Your screenshot"
              className="max-h-[360px] w-full object-contain"
            />
            <button
              type="button"
              onClick={onClearImage}
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/60 text-[14px] text-muted backdrop-blur"
              aria-label="Remove screenshot"
            >
              ✕
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-[18px] flex flex-1 flex-col items-center justify-center gap-[14px] rounded-[24px] border-[1.5px] border-dashed border-white/[.14] p-6 text-center"
          style={{
            background:
              "radial-gradient(120px 120px at 50% 38%,rgba(255,106,91,.10),transparent 70%)",
          }}
        >
          <span
            className="grid h-[66px] w-[66px] place-items-center rounded-[22px] border border-white/[.14] text-[26px]"
            style={{
              background:
                "linear-gradient(150deg,rgba(255,106,91,.2),rgba(255,174,92,.12))",
            }}
          >
            📸
          </span>
          <span>
            <b className="text-[16px] font-semibold">Drop a screenshot</b>
            <br />
            <small className="text-[12.5px] text-muted">
              her bio · or the conversation
            </small>
          </span>
        </button>
      )}

      <button
        type="button"
        onClick={onOpenVoice}
        className="mt-[14px] inline-flex w-fit items-center gap-[7px] rounded-full border border-white/[.08] bg-white/[.02] px-[13px] py-2 text-[12.5px] text-[#f4eef0]"
      >
        <span className="h-[7px] w-[7px] rounded-full bg-ember-1" />
        <span className="text-muted">Voice:</span>
        <b className="font-semibold">{voice.name.replace(/^The /, "")}</b>
        <span className="text-muted">▾</span>
      </button>

      {error && (
        <p className="mt-3 rounded-[12px] border border-[rgba(255,106,91,.4)] bg-[rgba(255,106,91,.08)] px-3 py-2 text-[12.5px] text-rose">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={!imageDataUrl}
        onClick={onSubmit}
        className="ember-btn mt-[14px] rounded-[16px] py-[15px] text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
      >
        Read it &amp; reply
      </button>
    </div>
  );
}
