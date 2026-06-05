# Iteration memory

Append-only log. Newest entry on top. Each entry: date · what changed · why · next.

---

## 2026-06-05 — Two-pass: accurate chat structuring (flash) + faithful history storage
**Why:** flash-lite reading the screenshot inside the single reply call mis-attributed "who wrote what" on tricky layouts — verified on a WhatsApp reply-quote screenshot ("Celeste") where flash-lite FLIPPED her/him between runs and DUPLICATED the quoted lines (the WhatsApp reply inset shows the original author's name + a snippet; lite emitted it as a phantom incoming message). That corrupted the stored thread. User validated (via `scripts/structure-chat.mjs`) that **gemini-2.5-flash** with an alignment-first structuring prompt nails both a WhatsApp reply-quote chat and a Tinder chat, stably.
**Changed:** Added a dedicated **structuring pass** as the single source of truth for the transcript. (1) `lib/prompt.ts` — `STRUCTURE_SYSTEM`/`STRUCTURE_USER` (decide author by LEFT/RIGHT alignment, NOT bubble color; reply-quote → `reply_to`, never its own message; name from header; ignore UI chrome; strict JSON) + `parseStructuredChat()`. (2) `lib/openrouter.ts` — `structureModel()` (`STRUCTURE_MODEL`||`VISION_MODEL`||`google/gemini-2.5-flash`); `completeChat()` now takes optional `model`/`temperature`/`maxTokens`. (3) `lib/structure.ts` — `structureChat(imageDataUrl)` → `StructuredChat|null` (temp 0.1, best-effort). (4) `lib/types.ts` — `StructuredChat`/`StructuredMessage`. (5) **`/api/reply` is now two-pass**: structure first (skipped on regen) → merge its lines onto stored history (deduped by normalized text, `newLinesFrom`) → feed that accurate thread to the streamed flash-lite writer AND persist the NEW lines to `messages` (him→`sent`, her→`them`) + the struct transcript to `turns.transcript`. Match name now comes from the struct header read (`struct.matchName ?? meta.matchName`). Falls back to the writer's own transcript/`read` line if structuring fails. Replaces the old new-vs-continuing seed logic with one deduped path → continuing turns no longer under-store (used to save only the single new `them` line). Trade-off: TTFT grows by the structuring call (~1-2s); accuracy prioritized. No Vercel env change needed (hardcoded flash default).
**Verified:** `tsc` clean; `npm run build` ok. **Live via the real `/api/reply` (dev server + live DB, throwaway matches, auto-cleaned):** IMG_1652 stored 8 her + 3 him + 1 suggestion, name "Celeste", reply-quote lines stored once (NO dup, NO flip), anchors correct; IMG_1653 stored 3 her + 4 him + 1 suggestion, name "Tetiana". **Deployed to https://robuai.vercel.app** (smoke: home 200, bad-body→400). Test harness: `scripts/structure-chat.mjs` (model-swappable), `/tmp/verify_history.py`.
**Next:** continuing-thread dedup is by exact normalized text — legit repeated lines ("haha" twice) would be dropped; revisit if it bites. Consider showing the structured app/name in the UI. Watch flash cost/latency vs lite.

---

## 2026-06-05 — Regenerate-after-3 with proposal memory + inline option notes
**Why:** DB analysis confirmed per-conversation storage, swipe feedback (-1/+1), and comments already worked. Two gaps vs the ask: (a) regeneration was a manual ↻ that re-ran `/api/reply` with no memory of prior proposals (so it could repeat rejected options — rejected ones live only in `feedback`, never in the prompt), and (b) the comment composer existed only in `Thread.tsx`, not on the swipe screen. User decisions: auto-regen on rejecting the **3rd** card (keep ↻ too); inject **all** proposals ever made for the match; add a per-option note on the Result screen.
**Changed:** (1) **`ReplyRequest`** gained `regen?`/`turnId?` (`lib/types.ts`). (2) **`/api/reply`** — when `regen`, it gathers every `turns.options[].reply` for the match (deduped) and feeds them as the avoid-list into BOTH the primary (`buildSingleUser(history, avoid)`) and the alternates (`buildAlternateUser`); it also **skips** re-storing the screenshot and re-inserting the incoming `them` line (already stored), but still creates a fresh `turns` row + suggestion message so feedback indices stay 0-based per batch and copy→promote keeps working. (3) **`lib/prompt.ts`** — `buildSingleUser` now takes an optional `avoid[]`; the avoid block is shared via a private `avoidBlock()` and `buildAlternateUser` delegates to it. (4) **`Result.tsx`** — swiping left (reject) on the LAST card calls `onRegenerate()` (guarded by `!live && !regenerating`); new per-option note composer (reuses Thread's Composer styling) posting via `onCommentOption(turnId, optionIndex, body, messageId?)` — primary card passes `suggestionMessageId`, alternates pass null + rely on turn_id/option_index. (5) **`app/page.tsx`** — `requestReply` sends `regen`/`turnId` (added `result?.turnId` to deps); new `commentOnOption` fire-and-forget POST to `/api/comments` (no thread reload). No schema migration — `turns`/`feedback`/`comments` already had every column.
**Verified:** `tsc --noEmit` clean; `npm run build` 10/10. **Live end-to-end (dev server + live DB, throwaway match, auto-cleaned incl. Storage object):** all 5 assertions PASS — regen adds NO new `uploads` row (1→1) and NO duplicate `them` line (2→2), creates a fresh `turns` row (1→2), and its 3 options have ZERO overlap with the first batch (avoid-list memory works — same coffee theme, totally different angles); inline option-note persisted with correct `turn_id`+`option_index` (+`message_id` on the primary). Real data untouched (3 matches before/after). Harness: `/tmp/verify_step4.py` (Pillow-rendered fake chat screenshot; Management API via curl w/ browser UA). **Deployed to https://robuai.vercel.app** (prod smoke: home 200, `/api/reply` bad-body→400).
**Next:** consider showing existing option notes on the card; surface feedback/notes in History for tuning; (note: each regen leaves the prior turn's primary as a `suggestion` message in history → shows as "suggested" memory, which is intended but could clutter long threads).

---

## 2026-06-05 — Conversation-on-upload + screenshot storage + user comments
**Why:** user wants the conversation stored the moment a picture is uploaded ("nothing discarded") — including the screenshot image and free-text comments, alongside the existing messages + swipe feedback.
**Changed:** (1) **Re-sequenced `/api/reply`** — the match row + the uploaded screenshot are now persisted at the START of the request, before the AI call, and the FIRST NDJSON event is `{type:"conversation", matchId, uploadId}` (client `app/page.tsx` sets `activeMatchId` immediately). The old mid-stream match INSERT became an UPDATE (name is set once the model has read it). On a continuing thread no new match is created; each turn adds another `uploads` row. Result: the conversation survives even if the AI fails/disconnects (verified — a cut-off request still stored the upload). (2) **Image storage** — new private Supabase Storage bucket `screenshots` (created via Storage API; SQL can't make buckets), path `{deviceId}/{matchId}/{uploadId}.jpg`. New `lib/storage.ts` (`decodeDataUrl` → bytes, `uploadScreenshot` best-effort, `signedUrl` minted on read, never persisted). New `uploads` table (match_id cascade, turn_id `on delete set null` back-linked after the turn, storage_path NOT NULL, byte_size from decoded buffer). (3) **Comments** — new `comments` table (match_id, nullable message_id = conversation-level vs message-level, body) + `POST/GET /api/comments`; `GET /api/matches/[id]` now also returns `uploads` (with signed URLs) + `comments`; `components/Thread.tsx` shows stored screenshots and per-message + whole-conversation comment composers. Schema applied to live DB via Management API.
**Verified (live, dev server + test fixture, then cleaned up incl. Storage objects):** first stream event is `conversation`; `uploads` row + Storage object exist (160-byte JPEG, `byte_size` correct), `turn_id` back-linked; comments at both levels persist, empty body → 400; signed URL fetch returns 200 image/jpeg; continuing call = same match, +1 upload/turn. Typecheck clean.
**Next:** optional comment box on the live Result card (plumbing — `suggestionMessageId` — already returned in the `primary` event); History could show a screenshot thumbnail; consider Storage lifecycle/cleanup on match delete (DB cascades, Storage objects don't — delete by `{deviceId}/{matchId}/` prefix).

---

## 2026-06-05 — Durable storage maturity: sent messages, full transcript seeding, swipe feedback
**Why:** maturity review of message/conversation persistence. Verified live (Frankfurt `vhpktlsbtnallcnhodmq`): per-device `matches`, role-tagged `messages`, server-only RLS all work. Found three gaps and closed them.
**Changed:** (1) **His side is now durable** — `/api/select` promotes the kept suggestion message to `role='sent'` (was left as `suggestion` forever), so each thread is a real two-sided record of what he actually sent. (2) **Full back-and-forth seeded** — on a NEW match, `/api/reply` expands the model's `transcript` into individual `messages` rows (her→`them`, him→`sent`) with explicit monotonic `created_at` (a batch insert shares one `now()`, which would scramble order); continuing turns stay incremental (just the new `them` line) so no duplication. (3) **Swipe feedback** — new `feedback` table (turn_id, match_id, device_id, option_index, reply, **score ∈ {-1,+1}**, source `swipe|copy`, unique on (turn_id,option_index)). New `POST /api/feedback` upserts; `Result.tsx` records **left = -1, right = +1** on each option card; copying records +1 (source `copy`) via `/api/select`. Schema applied via Management API (PAT in keychain "Supabase CLI", `go-keyring-base64:` prefix → strip → base64 -d → `sbp_…`; use **curl** not urllib — Cloudflare 403s non-browser UAs).
**Verified:** isolated test fixture exercised live — feedback upsert dedupes (re-swipe -1→+1 = one row), bad score → 400, suggestion flips to `sent`, `selected_index` recorded, cascade delete cleans children. Typecheck clean. **NOT yet deployed to Vercel** (code change pending `vercel --prod`); DB schema already live.
**Next:** deploy + commit; surface feedback counts in History/tuning; consider per-turn feedback view for prompt tuning.

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
