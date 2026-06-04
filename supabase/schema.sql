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

-- Lock the tables to server-only access.
alter table public.profiles enable row level security;
alter table public.matches  enable row level security;
alter table public.messages enable row level security;
alter table public.turns    enable row level security;
