-- RobuAI schema. Run this in the Supabase SQL editor.
-- All access is via the server using the service-role key, which bypasses RLS.
-- RLS is enabled with NO public policies so the anon key can't read/write.

create extension if not exists "pgcrypto";

-- One row per device (anonymous identity). Holds the learned-voice seed.
create table if not exists public.profiles (
  device_id   text primary key,
  voice_id    text not null default 'playful',
  age_range   text,
  intent      text,
  interests   text[],
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One row per match (a conversation thread).
create table if not exists public.matches (
  id           uuid primary key default gen_random_uuid(),
  device_id    text not null,
  name         text,
  last_stage   text,
  last_snippet text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists matches_device_idx on public.matches (device_id, updated_at desc);

-- Messages within a thread: what she said, what we suggested, what he sent.
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches (id) on delete cascade,
  role       text not null check (role in ('them', 'suggestion', 'sent')),
  content    text not null,
  stage      text,
  created_at timestamptz not null default now()
);
create index if not exists messages_match_idx on public.messages (match_id, created_at);

-- One row per reply request: the options we generated, which the user picked,
-- and (for chats) the transcript the model read — kept for review/tuning.
create table if not exists public.turns (
  id                    uuid primary key default gen_random_uuid(),
  match_id              uuid references public.matches (id) on delete cascade,
  device_id             text not null,
  stage                 text,
  transcript            jsonb,   -- [{from:'her'|'him', text}] for chats; [] for profiles
  options               jsonb,   -- [{reply, why}] in display order (index 0 = primary)
  suggestion_message_id uuid,    -- the thread message we update when a pick changes
  selected_index        integer, -- which option the user copied/sent
  selected_reply        text,
  created_at            timestamptz not null default now()
);
create index if not exists turns_match_idx on public.turns (match_id, created_at);

-- Swipe feedback: one signed judgment per option per turn.
-- score = -1 (swiped left / rejected) or +1 (swiped right or copied / liked).
-- Upserted on (turn_id, option_index) so the user's latest judgment wins.
create table if not exists public.feedback (
  id           uuid primary key default gen_random_uuid(),
  turn_id      uuid not null references public.turns (id) on delete cascade,
  match_id     uuid references public.matches (id) on delete cascade,
  device_id    text not null,
  option_index integer not null,
  reply        text,
  score        integer not null check (score in (-1, 1)),
  source       text not null default 'swipe' check (source in ('swipe', 'copy')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (turn_id, option_index)
);
create index if not exists feedback_turn_idx on public.feedback (turn_id);
create index if not exists feedback_device_idx on public.feedback (device_id, created_at desc);

-- Lock the tables to server-only access.
alter table public.profiles enable row level security;
alter table public.matches  enable row level security;
alter table public.messages enable row level security;
alter table public.turns    enable row level security;
alter table public.feedback enable row level security;
