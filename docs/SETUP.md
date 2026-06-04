# Setup — clone to deployed

A friendly, step-by-step guide to run RobuAI locally and ship it to Vercel.

## a. Prerequisites

- **Node 22** (LTS). Check with `node -v` — it should print `v22.x`.
  If you use `nvm`: `nvm install 22 && nvm use 22`.
- A **Supabase** account (free tier is fine).
- An **OpenRouter** account + API key (for the vision/text model).

## b. Install dependencies

From the repo root:

```bash
npm install
```

(Do not edit `package.json` — the dependency versions are fixed.)

## c. Create the database

1. Go to [supabase.com](https://supabase.com) → **New project**. Pick a name, a strong
   database password, and a region close to you. Wait for it to finish provisioning.
2. In the project, open **SQL Editor** → **New query**.
3. Open `supabase/schema.sql` from this repo, copy its full contents, paste into the
   editor, and click **Run**. This creates the `profiles`, `matches`, and `messages`
   tables (RLS is enabled with no public policies — all access is server-side only).

## d. Configure environment variables

1. In Supabase, go to **Settings → API**.
2. Copy the **Project URL** → this is `SUPABASE_URL`.
3. Under **Project API keys**, copy the **`service_role`** secret → this is
   `SUPABASE_SERVICE_ROLE_KEY`. (Use the service-role key, **not** the anon key. It is a
   server-only secret — never expose it to the browser.)
4. Copy `.env.example` to `.env` and fill in the four values:

   ```bash
   cp .env.example .env
   ```

   ```
   OPENROUTER_API_KEY=sk-or-v1-...
   OPENROUTER_MODEL=anthropic/claude-sonnet-4.6
   SUPABASE_URL=https://xxxxxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```

   `.env` is gitignored — never commit it. If `OPENROUTER_MODEL` is omitted it defaults
   to `anthropic/claude-sonnet-4.6`.

## e. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**To test on your phone** (recommended — this is a phone-first app): make sure the phone
is on the **same Wi-Fi network** as your computer, find your machine's local IP
(e.g. `192.168.1.42`), and open `http://192.168.1.42:3000` in the phone browser. Or just
use the deployed URL from step f.

## f. Deploy to Vercel

1. Push the repo to GitHub:

   ```bash
   git push
   ```

2. Go to [vercel.com](https://vercel.com) → **Add New… → Project** → import the GitHub
   repo. Vercel auto-detects Next.js — keep the defaults.
3. Before deploying, open **Settings → Environment Variables** and add the **four**
   variables (same values as your `.env`):
   - `OPENROUTER_API_KEY`
   - `OPENROUTER_MODEL`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Click **Deploy**. `vercel.json` gives the `/api/reply` route a 60s timeout for the
   vision call.

## g. Add to the phone home screen

For an app-like, full-screen feel, open the deployed URL on the phone and use
**Share → Add to Home Screen** (iOS Safari) or the **Install app** prompt (Android
Chrome). Launching from the icon hides the browser chrome.

## Note on costs

Every "get a reply" tap makes **one OpenRouter call** (the model reads the screenshot and
writes the reply). You are billed per call by OpenRouter based on the model and the image
+ token usage. Pick a cheaper vision model via `OPENROUTER_MODEL` if you want to lower
the per-reply cost.
