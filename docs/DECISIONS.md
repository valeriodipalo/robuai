# Locked decisions

Source of truth for product + tech choices. Change here first, then log the change in MEMORY.md.

## Product
- **Core loop:** upload screenshot → AI detects stage → one best reply in his voice → copy/send.
- **Scope:** all moments — opener, reply, escalation (auto-detected from the screenshot).
- **Output:** the primary reply **streams** live, then 2 alternates load → a **swipeable deck of 3 options** (swipe left/right, dots). The option the user copies is **recorded** (`turns.selected_index`) for voice tuning.
- **Transcript:** for chat screenshots, the conversation the model read is saved to `turns.transcript` (for review/debugging).
- **Voice:** seeded from one of three starter profiles, refined over use (edits + regenerates).
- **Language:** English.
- **History:** saved (each match = a thread; context carries over).

## Tech
- **Platform:** phone-first web app.
- **Framework:** Next.js 15 (App Router) + TypeScript.
- **Styling:** Tailwind CSS 3 (custom after-dark theme; Fraunces + Hanken Grotesk).
- **Deploy target:** Vercel.
- **Auth:** none — anonymous device-id model (id in browser `localStorage`, no accounts).
- **AI:** OpenRouter, **single streaming multimodal call** — `google/gemini-2.5-flash-lite` (env `MODEL`) reads the screenshot AND writes the reply in voice from thread memory, **streamed** token-by-token (reply framed by `<<<REPLY>>>` / `<<<META>>>`). ~3s TTFT vs ~28s before. Chose speed over the earlier MiniMax-M3 writer (M3's reasoning added ~25s). Two-stage (`VISION_MODEL`/`REPLY_MODEL`) kept as legacy/unused.
- **Latency:** client downscales screenshots to ~1280px JPEG before upload; reply streams live so first words show in ~3s.
- **Data:** Supabase (Postgres). All access is **server-side only** via the service-role
  key; RLS enabled with no public policies (anon key can't read/write). The browser never
  sees a Supabase or OpenRouter secret.
- **Secrets:** keys in `.env`, server-side only.
- **Memory:** markdown files in `docs/`.

## Out of scope (v1)
- Native mobile app · accounts/payments · direct Tinder automation · multi-option replies · non-English.

## Open / unconfirmed
- Voice setup wording: "three potential profiles, learn the tone from this" read as *pick 1 of 3 starter voices, refine over iterations* — **awaiting final confirm**.
