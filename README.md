# RobuAI

A phone web app that helps you reply on Tinder. Upload a screenshot of the chat → get the single best next message, written in your voice.

## Repo layout

```
SPEC.md            Product + tech spec (the what & why)
README.md          You are here
vercel.json        Vercel config (60s timeout for the reply route)
.env               Secrets (OpenRouter + Supabase keys) — gitignored, never committed
.env.example       Template for .env

app/               Next.js App Router — pages + API route handlers
lib/               Shared logic — types, voices, prompt, Supabase, device id
components/        UI components for the screens
supabase/
  schema.sql       Database schema — run in the Supabase SQL editor

docs/
  SETUP.md         Clone → run → deploy, step by step
  DESIGN.md        Design system + screen-by-screen UI decisions
  MEMORY.md        Iteration log — every change & decision, newest first
  DECISIONS.md     Locked product/tech choices (the source of truth)

design/
  mockup.html      Static visual mockup of all screens — open in a browser
```

## How memory works (md-based)

This repo keeps its own memory in markdown so iterations stay traceable:

- **`docs/DECISIONS.md`** — what we've locked. Update it when a choice changes.
- **`docs/MEMORY.md`** — an append-only log. Every iteration adds an entry at the top: what changed, why, what's next.
- **`docs/DESIGN.md`** — the living design reference the mockup is built from.

Before building anything, read DECISIONS + MEMORY to know the current state.

## AI provider

OpenRouter (vision + text in one call). Key lives in `.env` as `OPENROUTER_API_KEY`.
The key is **only ever used server-side** — never shipped to the browser.

## Run locally

1. Node 22 + `npm install`.
2. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
3. Copy `.env.example` → `.env` and fill in the OpenRouter + Supabase values.
4. `npm run dev`, then open <http://localhost:3000> (use your machine's LAN IP to test on the phone).

Full walkthrough: **[docs/SETUP.md](docs/SETUP.md)**.

## Deploy

Push to GitHub, import to Vercel, set the four env vars (`OPENROUTER_API_KEY`,
`OPENROUTER_MODEL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), deploy. Costs are
per-OpenRouter-call. Step-by-step: **[docs/SETUP.md](docs/SETUP.md)**.

## Status

**v1 built — needs Supabase project + deploy.** See `design/mockup.html` for the visual
reference and `docs/SETUP.md` to go live.
