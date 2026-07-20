-- ADR-0003 step 1 — Auth: profiles table + edition counter.
--
-- Run this once in your Supabase project (SQL Editor, or `supabase db push` if you
-- use the CLI). It creates the per-user profile row the app reads for the colophon,
-- assigns each new signup a monotonic EDITION ordinal + JOIN YEAR via a trigger, and
-- locks every row to its owner with Row-Level Security. No app data is touched here
-- (Dexie stays the source of truth until ADR-0003 step 3).

-- ── Edition sequence ─────────────────────────────────────────────────────────
-- The "Nth user to join" counter the client cannot know on its own. A plain
-- sequence: gapless-enough for an edition ordinal, and monotonic under concurrency.
create sequence if not exists public.profile_edition_seq;

-- ── profiles ─────────────────────────────────────────────────────────────────
-- One row per auth user (id = auth.users.id). edition + joined_year are assigned
-- once, at signup, by the trigger below and never change.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  edition     integer not null,
  joined_year integer not null,
  created_at  timestamptz not null default now()
);

-- ── Signup trigger ───────────────────────────────────────────────────────────
-- On every new auth user, mint their profile: next edition ordinal, the current
-- year as the volume, and their email. SECURITY DEFINER so it can write the row
-- regardless of the (not-yet-authenticated) caller; search_path pinned per Supabase
-- guidance so the function can't be hijacked by a mutable search_path.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, edition, joined_year)
  values (
    new.id,
    new.email,
    nextval('public.profile_edition_seq'),
    extract(year from now())::int
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Row-Level Security ───────────────────────────────────────────────────────
-- Every read/update is scoped to the caller's own row. There is deliberately NO
-- insert policy: rows are created only by the SECURITY DEFINER trigger, never by
-- the client. No delete policy: a profile dies with its auth user (ON DELETE CASCADE).
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
