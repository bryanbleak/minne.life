-- Phase 2: AI pipeline storage (SPEC.md §6-7) and BYO API keys
-- (docs/DECISIONS.md #5).

-- Derivations: AI-produced artifacts. transcript_raw is immutable; cleaned
-- versions and summaries are regenerable, stamped with model + prompt version.
create table public.derivations (
  id uuid primary key,
  recording_id uuid not null references public.recordings (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('transcript_raw', 'transcript_clean', 'summary')),
  content text not null,
  model_version text,
  prompt_version text,
  created_at timestamptz not null default now()
);

alter table public.derivations enable row level security;

-- Users can read their own derivations; only the server (service role,
-- which bypasses RLS) can write them.
create policy "read own derivations" on public.derivations
  for select using ((select auth.uid()) = user_id);

create index derivations_recording_idx on public.derivations (recording_id, kind);

-- Per-user AI provider keys, encrypted by the Edge Functions before storage
-- (AES-GCM with a server-held key). RLS is enabled with NO policies: clients
-- can never read or write this table, even their own rows — all access goes
-- through the api-keys Edge Function using the service role.
create table public.user_api_keys (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic')),
  key_ciphertext text not null,
  key_last4 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.user_api_keys enable row level security;
