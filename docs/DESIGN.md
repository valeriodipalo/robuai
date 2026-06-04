# Design reference

Living reference for the UI. The mockup at `design/mockup.html` is built from this. Iterate here, then update the mockup.

## Direction (v0)
**After-dark / intimate.** This is a tool used at night, alone, with a bit of nerves. So: moody, premium, confident — not loud or "bro-y", not clinical SaaS. Warm ember light on a deep ink background, like a dim room lit by a phone screen.

## Design tokens
- **Background:** deep ink `#0d0a12` with soft radial ember/rose glows.
- **Accent (ember):** gradient `#ff6a5b → #ffae5c`; rose support `#ff8fa3`.
- **Text:** `#f4eef0` primary · `#a99fab` muted · `#6f6675` faint.
- **Success / "date" cue:** `#76e3b0`.
- **Surfaces:** translucent cards over ink; 1px hairline borders `rgba(255,255,255,.08)`.
- **Grain overlay** for texture; soft drop shadows for depth.

## Typography
- **Display:** *Fraunces* (warm optical serif) — headings + the reply itself, so the suggested message feels human and crafted.
- **Body / UI:** *Hanken Grotesk* — clean, friendly, legible at small sizes.
- Deliberately avoids Inter / Roboto / Space Grotesk.

## Screens (v0)
1. **Onboarding — Pick your voice.** Three voice cards (Playful Teaser / Confident Direct / Genuine Curious), each with a real example line. One selected with an ember glow. Step indicator "1 of 2".
2. **Home — Drop a screenshot.** Big dashed dropzone (her bio or the chat). Current-voice chip. Primary "Read it & reply".
3. **Reply — The one move.** Shows the read screenshot + an auto-detected **stage badge** (Opener / Her reply / Date?). One reply in Fraunces, with a one-line "why it works". Actions: **Copy & send** (primary) + **Regenerate** (↻).
4. **History — Your matches.** Thread list with avatar, last snippet, stage tag, time. Bottom tabs: New · Matches · Voice.

## Signature detail
The **one reply rendered in a serif**, inside an ember-lit card — that's the moment the app is remembered by. Everything else stays quiet so that card sings.

## Open design questions (for the user)
- Warmer (more coral/rose) or cooler (more amber/gold)?
- Keep the serif for the reply, or go all sans?
- Denser or airier?
- Dark only, or also a light theme?
