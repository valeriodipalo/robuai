# RobuAI — Tinder Conversation Assistant

**One line:** Upload a screenshot of a Tinder chat → get the single best next message, written in your voice.

**Status:** v1 spec · Last updated 2026-06-04

---

## 1. The problem

The user matches with girls on Tinder but freezes — he doesn't know what to say. The pain spans the whole conversation: the opener (blank screen), keeping it alive, and knowing when to ask for the date. He wants help that sounds like *him*, not like a robot, so he actually trusts it enough to hit send.

## 2. The core idea

A phone web app built around one loop:

```
Upload screenshot  →  AI reads it + detects the stage  →  one best reply in his voice  →  copy & send
```

Everything else (onboarding, history, learning) exists only to make that one reply better.

## 3. Decisions locked

| Decision | Choice |
|---|---|
| How it reads context | **Screenshot upload** (AI vision) |
| Scope | **All moments** — opener, reply, escalation (auto-detected) |
| Voice | **Learns his voice** — seeded from a profile, refined over use |
| Platform | **Phone web app** |
| Output | **One best reply** + regenerate |
| Language | **English** |
| Privacy | **Save history** |
| AI | **Claude (vision + text)**, user has an API key |

## 4. User experience

### Onboarding (once, ~60 seconds)
1. Pick a starting **voice profile** from three samples (each shows real example messages):
   - **The Playful Teaser** — cheeky banter, light challenges
   - **The Confident Direct** — clear, bold, goes for it
   - **The Genuine Curious** — warm, sincere, asks good questions
2. Quick taps: age range · what he's after (casual / dating) · 2–3 interests.

The chosen profile becomes his **starting voice seed**.

### Main loop (every use)
1. He uploads a screenshot — her bio, or the chat so far.
2. The AI **reads it** and **auto-detects the stage**:
   - empty chat → **opener**
   - she replied → **reply**
   - conversation is warm → **suggest escalating** (ask for the date/number)
3. Output: **one** send-ready message in his voice.
4. Actions: **Copy** · **Regenerate** (different angle).

### Voice learning ("over the iterations")
Every **regenerate** (rejection) and every **edit before copy** is a signal. The voice profile drifts from the generic seed toward how he actually talks. Saved history feeds this.

### History
Each match = a saved thread. Re-uploading a new screenshot from the same girl gives the AI the backstory → better continuity.

## 5. Architecture

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React web app (mobile-first) | Opens via URL; uploads from camera roll |
| Backend | Light server (Node) | Holds prompt logic; calls Claude; never exposes the API key to the browser |
| AI | Claude (one model, vision + text) | Reads the screenshot **and** writes the reply in a single call |
| Storage | Simple database | Voice profile + conversation history |
| Cost | ~cents per suggestion | One AI call per reply; cheap at prototype scale |

**The hardest part is prompt craft, not code** — making the reply not sound like AI. Build and test the prompt + voice system *before* any UI polish.

## 6. Build order

1. **Prove the magic** — bare page: upload screenshot → one great reply. No login, no history. Gate everything on this feeling good.
2. **3-profile onboarding** + voice seeding.
3. **History** + learn-from-edits loop.
4. Polish → decide if it becomes a real product.

## 7. Explicitly out of scope for v1
- Native iOS/Android app
- Accounts / payments / multi-user
- Direct Tinder integration (screenshots only — no automation against Tinder)
- Multiple reply options (one best reply only)
- Non-English conversations

## 8. Open questions / risks
- **Trust:** the reply must sound like him and reference her specifically, or he won't send it. This is the make-or-break — needs real testing with his own matches.
- **Screenshot quality:** blurry or cropped images may read poorly; need a graceful fallback.
- **Privacy:** saving private chats + personal data — fine for personal use, must be revisited before real users.
- **Tinder ToS:** assisting a human is fine; never automate sending or scrape Tinder directly.
