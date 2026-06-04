import { VoiceProfile, Message } from "./types";

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

/** The user-turn text accompanying the screenshot: the stored thread (memory). */
export function buildSingleUser(history?: Pick<Message, "role" | "content">[]): string {
  const lines: string[] = [];
  if (history && history.length) {
    lines.push("EARLIER IN THIS THREAD (memory from past turns, oldest first):");
    for (const m of history) lines.push(`- ${labelRole(m.role)}: ${m.content}`);
    lines.push("");
  }
  lines.push("Read the screenshot and give me my one move. Follow the output format exactly.");
  return lines.join("\n");
}

/** User turn for generating an ALTERNATE option — a different angle. */
export function buildAlternateUser(
  history: Pick<Message, "role" | "content">[] | undefined,
  avoid: string[]
): string {
  const base = buildSingleUser(history);
  const avoidBlock = avoid.length
    ? `\n\nI already have these options — give me a genuinely DIFFERENT angle (different hook, structure, or move), not a reword:\n${avoid
        .map((a) => `- "${a}"`)
        .join("\n")}`
    : "";
  return base + avoidBlock;
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
