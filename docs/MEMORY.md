# Iteration memory

Append-only log. Newest entry on top. Each entry: date · what changed · why · next.

---

## 2026-06-05 — Swipeable options + selection recording + chat transcript
**Changed:** Replies are now a **swipeable deck of 3 options**. `/api/reply` streams the primary option, then generates 2 alternates (`completeChat` with a "different angle" prompt via `buildAlternateUser`) and emits `primary`/`option`/`done` events. `components/Result.tsx` is a scroll-snap horizontal deck with dot indicators ("swipe for other angles"); `app/page.tsx` assembles `result.options` from the events. **Records the pick:** copying an option calls `/api/select` → `turns.selected_index/selected_reply`, and realigns the thread's stored suggestion + match snippet to the chosen option (so memory = what he actually used). **Chat transcript:** the model now also emits a `transcript` (the conversation it read) in META; saved to `turns.transcript` for chats (review/tuning). New `turns` table (id, match_id, device_id, stage, transcript jsonb, options jsonb, suggestion_message_id, selected_index, selected_reply) — applied via the Management API.
**Verified:** backend — 3 distinct options, selection recorded, chat transcript persisted exactly ("alright judge — iced oat latte…" etc.). Live browser — deck renders (OPTION 1/3 → swiped to 3/3 "oat milk?" option), dots track position, copy records. Typecheck clean, deployed.
**Next:** consider recording swipe-dwell too (not just copy); near-duplicate alternates occasionally — could dedupe by similarity; tune option diversity.

---

## 2026-06-05 — Single streaming call: 28s → ~3s (Gemini Flash Lite)
**Researched** the latency (parallel web search): MiniMax M3 is a *reasoning* model — it burned ~28s on hidden `<think>` tokens for a one-line reply. Benchmarked variants: M3 default 28.6s, M3 `reasoning:{enabled:false}` 5.2s, M2.1 3.6s, **gemini-2.5-flash-lite 1.9s**, gemini-flash read 2.4s.
**Rebuilt** to a **single streaming multimodal call** on `google/gemini-2.5-flash-lite` (env `MODEL`): one call reads the screenshot AND writes the reply, **streamed** token-by-token. `lib/openrouter.ts` → `streamChat()` (SSE parse); `lib/prompt.ts` → `buildSinglePrompt`/`buildSingleUser` + `splitReplyMeta` with `<<<REPLY>>>`/`<<<META>>>` framing; `app/api/reply/route.ts` returns an NDJSON `ReadableStream` (`delta`…`done` with matchId), persists after stream; `app/page.tsx` consumes the stream (flips to Result on first token, types the reply live); `components/Result.tsx` renders the live reply + caret, gates copy/regenerate until done; `components/Home.tsx` downscales screenshots to ~1280px JPEG before upload.
**Verified:** local TTFT 2.6s / total 2.9s; **live prod 3.35s / 4.2s**. Memory still works (A/B: "your pick?" → coffee with matchId, vague without). Fixed a preamble-leak bug (model prepended commentary) via the `<<<REPLY>>>` start marker. Typecheck clean, redeployed.
**Tradeoff:** dropped MiniMax (faster, different voice) — reversible via `MODEL` env.
**Next:** real-device test of streaming UX; the `<<<REPLY>>>` framing means a non-conforming model needs the fallback path (handled). Add passcode before sharing.

---

## 2026-06-04 — Autonomous live UI walkthrough + copy robustness fix
**Tested** the deployed app in a real browser end-to-end: onboarding (voice pick → checkmark/enable → step 2 age/intent/interests → Start), home/upload (file injected via DataTransfer, thumbnail preview), loading state, Result (live Gemini→MiniMax: stage badge OPENER, read caption, reply "Black coffee. Your verdict?" in serif, why line), and History (Sofia thread persisted with snippet + stage). All screens render and the full flow works on production.
**Two earlier "bugs" were false alarms** — automation synthetic-clicks don't always fire React onClick (a `.click()` worked fine); onboarding and post-onboarding routing (→ home) are correct. Not app bugs.
**Real fix shipped:** `components/Result.tsx` copy() now has a `document.execCommand` textarea fallback (+ always shows the "✓ Copied" state) for mobile in-app webviews (e.g. Tinder's browser) where `navigator.clipboard` is blocked — previously copy could silently no-op. Typecheck clean, redeployed to prod.
**Why:** Goal = perfectly usable + memory working; verify on the real deployment, not just unit/API.
**Open:** latency ~15-18s/reply (Gemini read + M3 reasoning) — could parallelize or use a faster reply model; app still public (add passcode before sharing).

---

## 2026-06-04 — Two-stage pipeline (Gemini reads → MiniMax writes), memory proven, redeployed
**Changed:** Split the AI into two stages per user request ("reading should run with Gemini"): **STAGE 1 `google/gemini-2.5-flash`** reads the screenshot into structured facts (type, name, age, bio, transcribed messages, notes — see `EXTRACTION_SYSTEM` in `lib/prompt.ts`); **STAGE 2 `minimax/minimax-m3`** writes the one reply in his voice from those facts + injected thread memory (no image). New `lib/openrouter.ts` exports `readScreenshot()` + `writeReply()`; `lib/prompt.ts` adds `EXTRACTION_SYSTEM`, `parseExtraction`, `buildWriterSystem`, `buildWriterUser`; `app/api/reply/route.ts` orchestrates read→write→persist. Models are env-configurable: `VISION_MODEL` / `REPLY_MODEL` (added to `.env` + Vercel for prod/preview/dev).
**Verified in backend (local + live):** Gemini reading is accurate (bio + tags + faithful message transcription). Opener/reply/escalate detection correct. **Memory proven by A/B control:** turn-2 screenshot "what's your actual pick?" → *with* matchId answers "espresso/oat milk" (coffee, from stored thread); *without* matchId guesses "ramen". Live prod (robuai.vercel.app) confirmed running the new pipeline with working memory. Latency ~10-15s/turn (Gemini read + M3 reasoning).
**Why:** User wants Gemini doing vision and MiniMax doing the conversation; memory must demonstrably work.
**Next:** Re-run the live UI walkthrough against this deploy (settle the earlier onboarding-flow question); consider trimming latency; add a passcode before sharing (app is public).

---

## 2026-06-04 — LIVE: deployed to Vercel, full stack verified
**Changed:** Applied the DB schema to Supabase via the **Management API** (`/database/query`) — the pooler/IPv6 paths don't work from this machine, but the app uses supabase-js over HTTPS so it's unaffected. Smoke-tested the exact app path (supabase-js + service-role: insert/select/cascade all green). Ran a **real end-to-end test** through `/api/reply` with a rendered fake Tinder profile: MiniMax M3 read the image, detected `opener`, returned an in-voice, specific reply, and persisted match+message correctly. Bumped **Next.js 15.1.6 → 15.5.19** (Vercel blocks the older version for a security CVE). Linked the Vercel project `robuai`, set the 4 env vars (prod/preview/dev), and **deployed to production**.
**Live URL:** https://robuai.vercel.app — homepage 200, production `/api/reply` verified working.
**Why:** Goal = working app, prompt tuned, chats in Supabase, deployed. Done.
**Next / open:** (1) App is public — anyone with the URL can spend OpenRouter credits; add a passcode or Vercel protection before sharing widely. (2) Validate the "illusion of memory" with a real multi-message chat screenshot. (3) Tune the prompt on real conversations. (4) Onboarding voice-learning beyond the 3 seeds.

---

## 2026-06-04 — MiniMax M3, memory injection, build green, Supabase provisioning
**Changed:** Switched AI model to **`minimax/minimax-m3`** (confirmed via OpenRouter live model list: text+image input, 1M ctx, ~10× cheaper than Claude; the M2.x family is text-only and would have broken vision). Updated `lib/openrouter.ts` (default model + 1400 max_tokens for reasoning headroom + HTTP-Referer) and `.env`/`.env.example`. Implemented the **"illusion of memory"**: `/api/reply` now re-injects the **full** stored thread (per match id, cap 500) into the prompt each turn instead of the last 10. Wrote **CLAUDE.md** (reusable orientation for other conversations). `next build` passes clean (page + 4 API routes). Created Supabase project **robuai** (ref `vhpktlsbtnallcnhodmq`, Frankfurt) and saved URL + service-role key to `.env`; schema apply is polling while the DB provisions.
**Why:** Lock the real model + memory model the user wants, and get to a verified, deploy-ready build.
**Next:** Confirm schema applied → smoke-test DB connectivity → set Vercel env vars → deploy. Then live-test a real screenshot reply.

---

## 2026-06-04 — v1 build: Next.js app scaffolded
**Changed:** Scaffolded the Next.js 15 (App Router) + TypeScript app via a parallel-agent
build split across four tracks: AI core (`lib/prompt.ts` system prompt + JSON parse,
`lib/voices.ts`, `lib/types.ts`), data API (route handlers + `lib/supabase.ts`), frontend
shell + screens (onboarding / upload / reply / history in `app/` + `components/`), and
deploy/docs (`vercel.json`, `docs/SETUP.md`, README + DECISIONS updates, this entry).
Supabase schema authored in `supabase/schema.sql` (profiles / matches / messages, RLS on,
server-side service-role access only). Tailwind 3 theme wired to the DESIGN system.
**Why:** Move from design-only to a working v1 the user can run on a phone and deploy.
**Next:** Create the Supabase project, run the schema, fill the four env vars, verify the
build, and deploy to Vercel (see `docs/SETUP.md`).

---

## 2026-06-04 — Repo skeleton + design starting point
**Changed:** Initialized git repo. Added README, DECISIONS, this MEMORY log, DESIGN reference, and `.env` (OpenRouter key, gitignored). Built first static UI mockup `design/mockup.html` covering 4 screens: onboarding (3 voice profiles), home/upload, reply result, history.
**Why:** User wants a maintainable repo with md-based memory, and a visual design to iterate on before writing more spec or code.
**Next:** Get design feedback → refine mockup → confirm voice-setup wording → build Step 1 (upload→reply prototype on OpenRouter).
