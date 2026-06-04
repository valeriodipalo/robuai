"use client";

import { StatusBar } from "./ui";

// Full-screen reading state while /api/reply works.
export default function Loading({ imageDataUrl }: { imageDataUrl: string | null }) {
  return (
    <div className="flex min-h-[100dvh] flex-col px-1 pb-8 pt-4">
      <StatusBar />
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        {imageDataUrl && (
          <div className="relative mb-8 h-[160px] w-[120px] overflow-hidden rounded-[18px] border border-white/[.1]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageDataUrl}
              alt=""
              className="h-full w-full object-cover opacity-70"
            />
            <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-transparent via-[rgba(255,106,91,.12)] to-transparent" />
          </div>
        )}
        <div
          className="grid h-14 w-14 animate-spin place-items-center rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg,transparent,rgba(255,106,91,.8))",
            mask: "radial-gradient(farthest-side,transparent calc(100% - 4px),#000 0)",
            WebkitMask:
              "radial-gradient(farthest-side,transparent calc(100% - 4px),#000 0)",
          }}
        />
        <p className="mt-6 font-display text-[20px] font-medium">Reading the room…</p>
        <p className="mt-2 text-[13px] text-muted">Finding your move.</p>
      </div>
    </div>
  );
}
