-- Minne initial schema — SPEC.md §6, Phase 1 scope.
-- Multi-tenant from day one: every table carries user_id with RLS enabled
-- (SPEC.md §4). AI-pipeline tables (derivations, chunks, vocabularies) and
-- encrypted user_api_keys arrive with Phase 2.

-- Profiles: one row per auth user. Carries the never-read `tier` column so
-- billing stays additive later rather than structural (SPEC.md §4).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  tier text not null default 'personal',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "read own profile" on public.profiles
  for select using ((select auth.uid()) = id);
create policy "update own profile" on public.profiles
  for update using ((select auth.uid()) = id);

-- Auto-create a profile whenever a user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Entries: the unit of capture. One entry has many blocks and many
-- recordings (one-to-many from day one — SPEC.md §5).
create table public.entries (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  memory_date date,
  source_type text,
  notion_page_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Blocks: content with provenance. 'source' blocks are verbatim quotes and
-- must never be modified by any pipeline step (SPEC.md §5).
create table public.blocks (
  id uuid primary key,
  entry_id uuid not null references public.entries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  "order" integer not null default 0,
  origin text not null check (origin in ('spoken', 'typed', 'source')),
  content text,
  created_at timestamptz not null default now()
);

-- Recordings: audio files (stored in the `audio` bucket) plus per-stage
-- pipeline status so a failed stage never orphans an entry (SPEC.md §7).
create table public.recordings (
  id uuid primary key,
  entry_id uuid not null references public.entries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  audio_path text not null,
  duration_seconds numeric,
  status_upload text not null default 'pending',
  status_transcribe text not null default 'pending',
  status_clean text not null default 'pending',
  status_extract text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.entries enable row level security;
alter table public.blocks enable row level security;
alter table public.recordings enable row level security;

create policy "own entries" on public.entries
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own blocks" on public.blocks
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own recordings" on public.recordings
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index entries_user_created_idx on public.entries (user_id, created_at desc);
create index blocks_entry_idx on public.blocks (entry_id, "order");
create index recordings_entry_idx on public.recordings (entry_id);

-- Private audio bucket. Paths are {user_id}/{entry_id}/{recording_id}.m4a
-- (SPEC.md §4); the policies below let users touch only their own folder.
insert into storage.buckets (id, name, public)
values ('audio', 'audio', false);

create policy "own audio read" on storage.objects
  for select using (
    bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "own audio insert" on storage.objects
  for insert with check (
    bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "own audio delete" on storage.objects
  for delete using (
    bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
