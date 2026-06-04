"use client";

import { useState } from "react";
import type { Comment, Match, Message, Upload } from "@/lib/types";
import { StatusBar, StageBadge, Avatar } from "./ui";

// A single saved conversation: the stored screenshot(s), the them/suggestion/
// sent bubbles (each with its own comments), a whole-conversation note, and a
// "Continue this chat" CTA that hands the matchId back to Home.
export default function Thread({
  match,
  messages,
  uploads = [],
  comments = [],
  loading,
  onBack,
  onContinue,
  onComment,
}: {
  match: Match | null;
  messages: Message[];
  uploads?: Upload[];
  comments?: Comment[];
  loading?: boolean;
  onBack: () => void;
  onContinue: (matchId: string, name: string | null) => void;
  onComment?: (matchId: string, body: string, messageId?: string | null) => void;
}) {
  const name = match?.name?.trim() || "New match";
  // open composer target: a message id, "convo", or null (closed)
  const [composer, setComposer] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const convoComments = comments.filter((c) => !c.message_id);
  const commentsFor = (messageId: string) => comments.filter((c) => c.message_id === messageId);

  function submit(messageId: string | null) {
    if (!match || !onComment) return;
    onComment(match.id, draft, messageId);
    setDraft("");
    setComposer(null);
  }

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

      {/* Stored screenshot(s) — newest first. Shown even if the AI produced no
          messages (the conversation is still saved from the upload). */}
      {uploads.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          <div className="px-1 text-[10px] font-semibold uppercase tracking-[.12em] text-faint">
            {uploads.length === 1 ? "Screenshot" : `${uploads.length} screenshots`}
          </div>
          {uploads.map((u) =>
            u.signedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={u.id}
                src={u.signedUrl}
                alt="Saved screenshot"
                className="w-full rounded-[14px] border border-white/[.08] object-cover opacity-90"
              />
            ) : (
              <div
                key={u.id}
                className="rounded-[14px] border border-white/[.08] bg-black/30 px-3 py-4 text-center text-[12px] text-faint"
              >
                screenshot stored
              </div>
            ),
          )}
        </div>
      )}

      {loading ? (
        <p className="mt-10 text-center text-[13px] text-faint">Loading…</p>
      ) : messages.length === 0 ? (
        <p className="mt-8 text-center text-[13px] text-faint">
          {uploads.length > 0
            ? "Screenshot saved — no reply was generated for this one."
            : "No messages saved yet."}
        </p>
      ) : (
        <div className="mt-5 flex flex-1 flex-col gap-2.5">
          {messages.map((msg) => (
            <div key={msg.id} className="flex flex-col gap-1.5">
              <Bubble message={msg} />
              {/* comments attached to this message */}
              {commentsFor(msg.id).map((c) => (
                <CommentLine key={c.id} body={c.body} side={msg.role === "them" ? "start" : "end"} />
              ))}
              {onComment &&
                (composer === msg.id ? (
                  <Composer
                    value={draft}
                    onChange={setDraft}
                    onSubmit={() => submit(msg.id)}
                    onCancel={() => {
                      setComposer(null);
                      setDraft("");
                    }}
                    placeholder="Add a note on this message…"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setComposer(msg.id);
                      setDraft("");
                    }}
                    className={`text-[10.5px] text-faint hover:text-muted ${
                      msg.role === "them" ? "self-start" : "self-end"
                    }`}
                  >
                    + comment
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}

      {/* Whole-conversation note */}
      {match && onComment && (
        <div className="mt-6 border-t border-white/[.06] pt-4">
          <div className="px-1 text-[10px] font-semibold uppercase tracking-[.12em] text-faint">
            Conversation notes
          </div>
          <div className="mt-2 flex flex-col gap-1.5">
            {convoComments.map((c) => (
              <CommentLine key={c.id} body={c.body} side="start" />
            ))}
          </div>
          {composer === "convo" ? (
            <div className="mt-2">
              <Composer
                value={draft}
                onChange={setDraft}
                onSubmit={() => submit(null)}
                onCancel={() => {
                  setComposer(null);
                  setDraft("");
                }}
                placeholder="Add a note on this whole conversation…"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setComposer("convo");
                setDraft("");
              }}
              className="mt-2 text-[11.5px] text-muted hover:underline"
            >
              + add a note
            </button>
          )}
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

function CommentLine({ body, side }: { body: string; side: "start" | "end" }) {
  return (
    <div
      className={`max-w-[85%] rounded-[10px] border border-white/[.06] bg-white/[.03] px-[10px] py-[6px] text-[12px] leading-[1.4] text-muted ${
        side === "end" ? "self-end" : "self-start"
      }`}
    >
      <span className="mr-1 text-faint">🗒</span>
      {body}
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-end gap-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        autoFocus
        className="flex-1 resize-none rounded-[12px] border border-white/[.1] bg-black/30 px-3 py-2 text-[13px] leading-[1.4] text-white placeholder:text-faint focus:border-ember-2/60 focus:outline-none"
      />
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!value.trim()}
          className="ember-btn rounded-[11px] px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-[11px] px-3 py-1 text-[11px] text-faint hover:text-muted"
        >
          Cancel
        </button>
      </div>
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
