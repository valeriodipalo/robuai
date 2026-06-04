"use client";

import type { Match, Message } from "@/lib/types";
import { StatusBar, StageBadge, Avatar } from "./ui";

// A single saved conversation: them / suggestion / sent bubbles, with a
// "Continue this chat" CTA that hands the matchId back to Home.
export default function Thread({
  match,
  messages,
  loading,
  onBack,
  onContinue,
}: {
  match: Match | null;
  messages: Message[];
  loading?: boolean;
  onBack: () => void;
  onContinue: (matchId: string, name: string | null) => void;
}) {
  const name = match?.name?.trim() || "New match";

  return (
    <div className="flex min-h-[100dvh] flex-col px-1 pb-28 pt-4">
      <StatusBar />

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="grid h-[34px] w-[34px] place-items-center rounded-[11px] border border-white/[.08] bg-white/[.02] text-[15px] text-muted"
            aria-label="Back"
          >
            ←
          </button>
          <Avatar name={name} index={0} size={30} />
          <b className="text-[15px] font-semibold">{name}</b>
        </div>
        {match?.last_stage && <StageBadge stage={match.last_stage} />}
      </div>

      {loading ? (
        <p className="mt-10 text-center text-[13px] text-faint">Loading…</p>
      ) : messages.length === 0 ? (
        <p className="mt-10 text-center text-[13px] text-faint">
          No messages saved yet.
        </p>
      ) : (
        <div className="mt-5 flex flex-1 flex-col gap-2.5">
          {messages.map((msg) => (
            <Bubble key={msg.id} message={msg} />
          ))}
        </div>
      )}

      {match && (
        <button
          type="button"
          onClick={() => onContinue(match.id, match.name)}
          className="ember-btn mt-6 rounded-[16px] py-[14px] text-[15px] font-semibold"
        >
          Continue this chat
        </button>
      )}
    </div>
  );
}

function Bubble({ message }: { message: Message }) {
  if (message.role === "them") {
    return (
      <div className="max-w-[80%] self-start rounded-[14px] rounded-bl-[4px] border border-white/[.08] bg-[#241c2d] px-[12px] py-[9px] text-[13px] leading-[1.4] text-muted">
        {message.content}
      </div>
    );
  }

  if (message.role === "sent") {
    return (
      <div
        className="max-w-[80%] self-end rounded-[14px] rounded-br-[4px] px-[12px] py-[9px] text-[13px] leading-[1.4] text-[#1c0f0a]"
        style={{ background: "linear-gradient(140deg,#ff8fa3,#ff6a5b)" }}
      >
        {message.content}
      </div>
    );
  }

  // suggestion — RobuAI's proposed move, serif to echo the reply card.
  return (
    <div
      className="max-w-[85%] self-end rounded-[16px] rounded-br-[4px] px-[13px] py-[10px]"
      style={{
        background:
          "linear-gradient(160deg,rgba(255,106,91,.14),rgba(255,174,92,.05))",
        boxShadow: "0 0 0 1px rgba(255,106,91,.3)",
      }}
    >
      <div className="text-[9.5px] font-semibold uppercase tracking-[.12em] text-ember-2">
        suggested
      </div>
      <div className="mt-1 font-display text-[15px] leading-[1.35]">
        {message.content}
      </div>
    </div>
  );
}
