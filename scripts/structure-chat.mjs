#!/usr/bin/env node
// Test harness: pass a chat screenshot through Gemini (via OpenRouter) and get
// back a STRUCTURED transcript — the focus is getting "who wrote what" right.
//
// Usage:
//   node scripts/structure-chat.mjs IMG_1652.PNG [IMG_1653.PNG ...]
//   MODEL=google/gemini-2.5-flash node scripts/structure-chat.mjs IMG_1652.PNG
//
// Reads OPENROUTER_API_KEY + MODEL from .env (no deps).

import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// ── load .env ─────────────────────────────────────────────────────────────
async function loadEnv() {
  try {
    const raw = await readFile(path.join(ROOT, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const s = line.trim();
      if (!s || s.startsWith("#") || !s.includes("=")) continue;
      const i = s.indexOf("=");
      const k = s.slice(0, i);
      let v = s.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {
    /* env may already be set */
  }
}

// ── the structuring prompt — alignment-first, reply-quote aware ─────────────
const SYSTEM = `You are a precise OCR + chat-layout analyst. You are given ONE screenshot of a dating/messaging app conversation (WhatsApp, Tinder, iMessage, Instagram DM, Hinge, Bumble, etc.). Reconstruct the conversation as STRUCTURED data. Your single most important job is getting WHO SAID WHAT exactly right.

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

const USER = "Here is the screenshot. Return the structured JSON exactly as specified. Get the left/right attribution and any reply-quotes right.";

function extractJson(raw) {
  let t = String(raw || "").trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a !== -1 && b !== -1 && b > a) t = t.slice(a, b + 1);
  return JSON.parse(t);
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

async function structure(file, model) {
  const buf = await readFile(path.isAbsolute(file) ? file : path.join(ROOT, file));
  const dataUrl = `data:${contentType(file)};base64,${buf.toString("base64")}`;
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://robuai.app",
      "X-Title": "RobuAI",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 2000,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: USER },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text().catch(() => "")}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  return { parsed: extractJson(content), raw: content };
}

function render(file, model, out) {
  console.log("\n" + "=".repeat(64));
  console.log(`📄 ${path.basename(file)}   ·   model: ${model}`);
  console.log("=".repeat(64));
  console.log(`app: ${out.app}   match_name: ${out.match_name}   user_side: ${out.user_side}`);
  if (out.notes) console.log(`notes: ${out.notes}`);
  console.log("-".repeat(64));
  const sepBefore = new Map();
  for (const s of out.separators ?? []) sepBefore.set(s.before_index, s.label);
  (out.messages ?? []).forEach((m, i) => {
    if (sepBefore.has(i)) console.log(`        —— ${sepBefore.get(i)} ——`);
    const who = m.from === "him" ? "HIM →" : "← HER";
    const t = m.time ? ` [${m.time}]` : "";
    const q = m.reply_to ? `  ⤷ replying to: "${m.reply_to}"` : "";
    const p = m.partial ? " (partial)" : "";
    const pad = m.from === "him" ? "                    " : "";
    console.log(`${pad}${who}${t}${p} ${m.text}${q ? "\n" + pad + q : ""}`);
  });
}

async function main() {
  await loadEnv();
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY missing from .env");
    process.exit(1);
  }
  const model = process.env.MODEL || "google/gemini-2.5-flash-lite";
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error("usage: node scripts/structure-chat.mjs <image> [image...]");
    process.exit(1);
  }
  const results = {};
  for (const f of files) {
    try {
      const { parsed } = await structure(f, model);
      render(f, model, parsed);
      results[path.basename(f)] = parsed;
    } catch (e) {
      console.error(`\n❌ ${f}: ${e.message}`);
    }
  }
  console.log("\n\n===== RAW JSON =====");
  console.log(JSON.stringify(results, null, 2));
}

main();
