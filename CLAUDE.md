# CLAUDE.md — RobuAI

Orientation for any Claude working on this repo. Read this first, then the linked docs.

## What it is
A phone-first web app: a Tinder texting wingman. The user uploads a **screenshot** of a chat or a girl's profile → the app returns **ONE** best message in his voice. Auto-detects the moment (opener / reply / escalate). No accounts — anonymous device id.

## Stack
- **Next.js 15 (App Router) + TypeScript**, **Tailwind 3** (custom "after-dark" theme).
- **AI (single streaming call, OpenRouter):** `google/gemini-2.5-flash-lite` (env `MODEL`) reads the screenshot AND writes the reply in his voice from thread memory, **streamed** live (~3s TTFT). Output framed `<<<REPLY>>>`…`<<<META>>>{json}`. (Earlier 2-stage Gemini→MiniMax kept as legacy env; MiniMax M3's reasoning made it ~28s.)
- **DB:** **Supabase** (Postgres). Server-side only via the service-role key — the browser never sees a secret.
- **Deploy:** Vercel. Both Supabase + Vercel are driven via **CLI** (user is authed: Vercel `valeriodipalo`, Supabase org `qynqiwgfgjhjyxzjsaad`).

## Repo map
```
app/            Next pages + API route handlers (reply, matches, profile)
components/      UI for the 4 screens (Onboarding/Home/Result/History/Thread + ui atoms)
lib/            types · voices · prompt · openrouter · supabase · device
supabase/schema.sql   DB schema (profiles · matches · messages · turns · feedback; RLS on, server-only)
design/mockup.html    Visual reference (the aesthetic is non-negotiable)
docs/  SPEC · DECISIONS · DESIGN · MEMORY · SETUP
```

## The contract (don't break these)
- **Types:** `lib/types.ts` is the source of truth. Key shapes: `ReplyRequest {imageDataUrl, voiceId, deviceId, matchId?}` → `ReplyResponse {stage, read, matchName, reply, why, matchId}`.
- **Voices:** 3 starter tones in `lib/voices.ts` (`playful` / `direct` / `curious`); seeds the prompt, refined over use.
- **Prompt = the product.** `lib/prompt.ts`: `buildSinglePrompt`/`buildSingleUser` (read + write, anti-AI-cringe, one short message) + `splitReplyMeta` (parses the streamed `<<<REPLY>>>`/`<<<META>>>` output, drops any preamble). Tune here, carefully.
- **API:** `POST /api/reply` (streams `delta`→`primary`→`option`×N→`done`; AI + persist), `POST /api/select` (records the picked option + promotes its message to `sent`), `POST /api/feedback` (upserts a swipe score), `GET/POST /api/profile`, `GET /api/matches`, `GET/DELETE /api/matches/[id]`.
- **Options + record:** reply is a **swipeable deck of 3** (primary streamed + 2 alternates). Copied option recorded in `turns.selected_index` and its thread message promoted to `role='sent'` (durable record of what he sent). Chat **transcript** the model read saved to `turns.transcript`, and on a **new** match expanded into per-line `messages` (her→`them`, him→`sent`) so the full back-and-forth is stored. (`turns`: options/transcript/selection per request.)
- **Swipe feedback:** each option card records a signed judgment — **left = −1, right = +1** — to `feedback` (one row per `(turn_id, option_index)`, upserted; `source` `swipe`|`copy`). Kept for voice tuning: which angles he rejects vs. keeps.

## Memory = "illusion of memory"
Each chat = a `matches` row with a unique id. All turns are stored in `messages` (`them` / `suggestion` / `sent`). On each reply we **re-inject the full thread history** for that match id into the prompt (invisible to the user) so the model "remembers". M3's 1M context makes full history cheap. (Cadence may later batch every ~5 messages.)

## Conventions
- Secrets live in `.env` (gitignored) — `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (+ `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` for CLI/psql). Never ship to the browser.
- Server-only DB access through `supabaseAdmin()`. Client identity via `getDeviceId()`.
- Match the existing code style; keep the design true to `design/mockup.html`.
- **Memory discipline:** after a meaningful change, prepend an entry to `docs/MEMORY.md`; update `docs/DECISIONS.md` when a choice changes.

## Current state (2026-06-05) — LIVE, streaming
Deployed at **https://robuai.vercel.app**. **Single streaming Gemini 2.5 Flash Lite call** — ~3s TTFT (was ~28s with MiniMax M3 reasoning). Reply streams live with a typewriter caret; memory verified (A/B control). Next.js pinned to **15.5.19** (Vercel blocks older for a CVE). Supabase project **`robuai`** (ref `vhpktlsbtnallcnhodmq`, Frankfurt) — schema applied via the **Management API** (`POST /v1/projects/{ref}/database/query`; PAT in macOS keychain service "Supabase CLI", go-keyring-base64 — pooler/IPv6 don't work locally, app uses supabase-js over HTTPS). Vercel project `valerios-projects-fd08f650/robuai`; env `MODEL` + Supabase keys set for prod/preview/dev.
**Open:** app is public (add a passcode before sharing); tune prompt on real convos. See `docs/MEMORY.md`.

## How to run / deploy
`npm install` → `npm run dev` (localhost:3000). Redeploy: `vercel --prod --yes`. Full walkthrough: `docs/SETUP.md`.
