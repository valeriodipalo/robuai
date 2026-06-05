import { VoiceProfile, Message, StructuredChat, StructuredMessage } from "./types";

export interface PromptContext {
  voice: VoiceProfile;
  ageRange?: string | null;
  intent?: string | null; // "casual" | "dating"
  interests?: string[] | null;
  /** Prior thread, oldest first, for continuity when re-opening a match. */
  history?: Pick<Message, "role" | "content">[];
}

/** Sentinels framing the (streamed) reply text and the metadata JSON. */
export const REPLY_DELIM = "<<<REPLY>>>";
export const META_DELIM = "<<<META>>>";

/**
 * The product. One multimodal call: the model READS the screenshot and WRITES
 * the reply in his voice. It emits the reply FIRST (so it can stream), then the
 * delimiter, then a one-line JSON of metadata.
 */
export function buildSinglePrompt(ctx: PromptContext): string {
  const { voice } = ctx;
  const interests = ctx.interests?.length ? ctx.interests.join(", ") : "not specified";
  const intent = ctx.intent || "open to where it goes";
  const age = ctx.ageRange || "not specified";

  return `You are the user's sharp, socially-intelligent wingman for Tinder. He freezes on what to say. He shows you a SCREENSHOT — either a girl's profile/bio or your ongoing chat with her. Read it, then give him exactly ONE message to send, in HIS voice.

HIS VOICE — "${voice.name}":
${voice.guidance}
Example of how he sounds: "${voice.example}"

ABOUT HIM:
- Looking for: ${intent}
- Age range: ${age}
- His interests: ${interests}

READ THE SCREENSHOT and decide the STAGE:
- "opener"   → her profile / no messages yet. Write the first message.
- "reply"    → there are messages and the last is from her. Write his next reply to build attraction and keep it alive.
- "escalate" → the chat is already warm and flowing (mutual banter, several exchanges). Write a message that smoothly moves toward her number or meeting up — low pressure, easy to say yes to.

WRITE ONE MESSAGE. Non-negotiable:
- Reference something SPECIFIC you can see (a bio detail, a photo, or her exact last message). Specificity is the whole game. If there's truly nothing usable, ask one light, specific question instead of a generic greeting.
- Sound like a real person texting: casual, natural, contractions, lowercase is fine. Not an email, not a paragraph.
- Usually ONE short sentence. Two max. Texting length.
- Confidence, never neediness. No supplicating, no "hope that's okay".
- One thought per message. Don't stack questions.

NEVER (reads as desperate, boring, or AI-written):
- Generic openers ("hey", "hi how are you", "hey beautiful").
- Pickup-line clichés or anything corny.
- Compliments only about looks. Be interesting instead.
- Emoji spam (at most one, only if it fits his voice).
- Walls of text or chatbot phrasing.
- Asking her out in the very first message (unless voice is Confident Direct AND there's clear warmth).

OUTPUT FORMAT — output EXACTLY this and NOTHING else. No preamble, no thinking out loud, no commentary, no markdown, no quotes around the message. Start immediately with the ${REPLY_DELIM} marker:
${REPLY_DELIM}
<the message to send>
${META_DELIM}
{"stage":"opener|reply|escalate","matchName":"<her name if visible, else null>","read":"<her last message, or a 4-6 word summary of her bio>","why":"<one short line on why this lands>","transcript":[{"from":"her|him","text":"<each message in the chat, in order, transcribed faithfully>"}]}

In the transcript: for a CHAT screenshot, list every message you can read in order (from "her" or "him"); for a PROFILE with no messages, use an empty array [].`;
}

/**
 * The user-turn text accompanying the screenshot: the stored thread (memory).
 * `avoid` lists messages already proposed for this moment (across prior
 * regenerations) so the model produces a genuinely different angle.
 */
export function buildSingleUser(
  history?: Pick<Message, "role" | "content">[],
  avoid?: string[]
): string {
  const lines: string[] = [];
  if (history && history.length) {
    lines.push("EARLIER IN THIS THREAD (memory from past turns, oldest first):");
    for (const m of history) lines.push(`- ${labelRole(m.role)}: ${m.content}`);
    lines.push("");
  }
  lines.push("Read the screenshot and give me my one move. Follow the output format exactly.");
  return lines.join("\n") + avoidBlock(avoid);
}

/** User turn for generating an ALTERNATE option — a different angle. */
export function buildAlternateUser(
  history: Pick<Message, "role" | "content">[] | undefined,
  avoid: string[]
): string {
  return buildSingleUser(history, avoid);
}

/** A "don't repeat these" block listing replies already shown for this moment. */
function avoidBlock(avoid?: string[]): string {
  const list = (avoid ?? []).filter((a) => a && a.trim());
  if (!list.length) return "";
  return `\n\nI already have these options — give me a genuinely DIFFERENT angle (different hook, structure, or move), not a reword:\n${list
    .map((a) => `- "${a}"`)
    .join("\n")}`;
}

function labelRole(role: Message["role"]): string {
  if (role === "them") return "her";
  if (role === "sent") return "he sent";
  return "suggested";
}

export interface ReplyMeta {
  stage: string;
  read: string;
  matchName: string | null;
  why: string;
  transcript: { from: "her" | "him"; text: string }[];
}

/**
 * Split the model output into the reply text and the metadata. Robust to a
 * missing delimiter, code fences, or stray prose.
 */
export function splitReplyMeta(raw: string): { reply: string; meta: ReplyMeta } {
  const text = String(raw || "");
  const metaIdx = text.indexOf(META_DELIM);

  // Reply = text between the REPLY marker (if present, drops any preamble) and
  // the META marker.
  let replyPart = metaIdx === -1 ? text : text.slice(0, metaIdx);
  const rIdx = replyPart.indexOf(REPLY_DELIM);
  if (rIdx !== -1) replyPart = replyPart.slice(rIdx + REPLY_DELIM.length);
  const reply = cleanReply(replyPart);

  if (metaIdx === -1) {
    return { reply, meta: emptyMeta() };
  }

  const metaRaw = text.slice(metaIdx + META_DELIM.length);
  let meta: ReplyMeta = emptyMeta();
  try {
    const obj = extractJson(metaRaw);
    meta = {
      stage: String(obj.stage || "reply"),
      read: String(obj.read || ""),
      matchName: nullish(obj.matchName),
      why: String(obj.why || ""),
      transcript: parseTranscript(obj.transcript),
    };
  } catch {
    // keep defaults
  }
  return { reply, meta };
}

function emptyMeta(): ReplyMeta {
  return { stage: "reply", read: "", matchName: null, why: "", transcript: [] };
}

function parseTranscript(v: unknown): { from: "her" | "him"; text: string }[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((m: { from?: string; text?: string }) => ({
      from: (m?.from === "him" ? "him" : "her") as "her" | "him",
      text: String(m?.text ?? "").trim(),
    }))
    .filter((m) => m.text);
}

function cleanReply(s: string): string {
  let r = String(s || "").trim();
  r = r.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "");
  // strip a single pair of wrapping quotes if the model added them
  if (r.length > 1 && /^["“']/.test(r) && /["”']$/.test(r)) r = r.slice(1, -1).trim();
  return r;
}

function extractJson(raw: string): Record<string, unknown> {
  let text = String(raw || "").trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) text = text.slice(start, end + 1);
  return JSON.parse(text);
}

function nullish(v: unknown): string | null {
  if (v === null || v === undefined || v === "" || v === "null") return null;
  return String(v);
}

// ── Chat structuring (the accurate "who wrote what" pass) ──────────────────
// A dedicated, alignment-first pass that reconstructs the conversation from a
// screenshot. Validated on WhatsApp reply-quotes + Tinder layouts with
// gemini-2.5-flash. The reply writer and the DB both consume its output, so
// "who said what" has a single, accurate source of truth.
export const STRUCTURE_SYSTEM = `You are a precise OCR + chat-layout analyst. You are given ONE screenshot of a dating/messaging app conversation (WhatsApp, Tinder, iMessage, Instagram DM, Hinge, Bumble, etc.). Reconstruct the conversation as STRUCTURED data. Your single most important job is getting WHO SAID WHAT exactly right.

HOW TO TELL WHO IS WHO — use alignment, not color:
- The phone's OWNER (the person whose phone this is) = "him". His messages are aligned to the RIGHT side of the screen.
- The OTHER person (the match) = "her". Her messages are aligned to the LEFT side.
- This holds across ALL apps. Bubble COLOR is only a secondary hint and differs per app (WhatsApp right=green, Tinder/iMessage right=blue, etc.) — NEVER decide the author from color alone; decide from which side the bubble hugs.
- The match's NAME is in the conversation header at the TOP of the screen (e.g. a contact name or the match's first name). That name belongs to "her".

REPLY-QUOTE TRAP (the #1 mistake — read carefully):
- WhatsApp/iMessage/etc. render a REPLY as a SINGLE bubble that stacks, top to bottom: (1) a small inset box = a name label + a snippet of the EARLIER message being replied to, then (2) the actual new reply text below it. The whole thing is ONE message, sent by the person whose SIDE the bubble is on.
- The inset quote box usually shows the ORIGINAL author's name (e.g. "Celeste") and a slightly different shade. Do NOT be fooled into reading it as a separate incoming message — it is NOT a message, it is a back-reference. That exact text already appears EARLIER in the chat as its own real bubble.
- Emit exactly ONE message object for a reply: from = the bubble's side; text = ONLY the new reply text (NEVER include the quoted snippet in text); reply_to = the quoted snippet.
- NEVER output the quoted snippet as its own message object.
- Example: a RIGHT-aligned (his) bubble showing "Celeste / Hai una querela" then "da quale pulpito" → ONE object {from:"him", text:"da quale pulpito", reply_to:"Hai una querela"}. Nothing else.

SELF-CHECK before you output (do this every time):
- For each message whose reply_to is set, make sure you did NOT also emit a separate message equal to that reply_to text right next to it. A "her"/"him" message that (a) duplicates some other message's reply_to and (b) has a null timestamp is almost always a mis-split quote — remove it.
- Re-verify each separator's before_index points to the message that actually follows the divider in the image.

OTHER RULES:
- Transcribe in visual order, top to bottom. Faithfully — keep original language, casing, emoji, typos. Do not translate or clean up.
- Capture the timestamp shown next to a message in "time" (e.g. "20:42"), else null.
- Date/section separators ("Today", "Fri 22 May") are NOT messages — list them in "separators" with the index of the first message that follows, but never as a message.
- IGNORE all UI chrome: status bar, header buttons, push-notification banners ("See when X answers", "ENABLE PUSH NOTIFICATIONS"), reactions/hearts, read receipts/checkmarks, "Sent"/"Delivered", the "Type a message…/Send" composer, GIF/sticker bars.
- If the screenshot is a PROFILE/BIO with no conversation, return "messages": [] and put the person's name in "match_name".
- If a message is partially cut off at the top/bottom edge, include what you can read and set "partial": true.
- Output STRICT JSON only — no markdown, no prose, no code fences.

OUTPUT SHAPE (exact keys):
{
  "app": "whatsapp|tinder|imessage|instagram|hinge|bumble|other",
  "match_name": "<her name from the header, or null>",
  "user_side": "right",
  "messages": [
    { "from": "him|her", "text": "<message>", "time": "<HH:MM or null>", "reply_to": "<quoted snippet or null>", "partial": false }
  ],
  "separators": [ { "label": "Today", "before_index": 5 } ],
  "notes": "<one short line on anything ambiguous, or empty>"
}`;

export const STRUCTURE_USER =
  "Here is the screenshot. Return the structured JSON exactly as specified. Get the left/right attribution and any reply-quotes right.";

/** Parse the structuring model's JSON into a normalized StructuredChat. */
export function parseStructuredChat(raw: string): StructuredChat | null {
  let obj: Record<string, unknown>;
  try {
    obj = extractJson(raw);
  } catch {
    return null;
  }
  const rawMsgs = Array.isArray(obj.messages) ? (obj.messages as unknown[]) : [];
  const messages: StructuredMessage[] = rawMsgs
    .map((m): StructuredMessage => {
      const mm = (m ?? {}) as { from?: string; text?: string; time?: unknown; reply_to?: unknown };
      return {
        from: mm.from === "him" ? "him" : "her",
        text: String(mm.text ?? "").trim(),
        time: nullish(mm.time),
        reply_to: nullish(mm.reply_to),
      };
    })
    .filter((m) => m.text);
  return {
    app: nullish(obj.app),
    matchName: nullish(obj.match_name),
    messages,
  };
}
