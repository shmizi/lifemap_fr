-- ADR-0003 step 3 — App data: Postgres schema + RLS, mirroring the local Dexie stores
-- (src/database/schema/stores.ts). Run this AFTER 0001.
--
-- Server-authoritative TARGET: Postgres becomes the source of truth and Dexie is
-- demoted to a read-cache. This migration only CREATES the tables + policies; the
-- app keeps reading/writing Dexie until the repository port flips the live path over
-- (the next step). The one-time importLocalDataToSupabase() seeds these tables from
-- the user's local data on first sign-in.
--
-- Design notes:
--  • Primary keys stay the app's client-generated nanoid strings (text), so every
--    foreign-key reference (goal_id, subgoal_id, …) copies over unchanged.
--  • Date/timestamp fields are stored as TEXT (ISO-8601 strings), exactly as Dexie
--    holds them — the app compares them lexicographically, so no timestamptz reformat.
--  • Every row carries user_id (default auth.uid()); a single FOR-ALL RLS policy per
--    table (auth.uid() = user_id) makes cross-user access physically impossible.
--  • FKs mirror the app's cascade rules: deleting a goal cascades its subtree;
--    deleting a milestone SETs NULL on its tasks (the app rehomes them to "loose").

-- ── goals ────────────────────────────────────────────────────────────────────
create table if not exists public.goals (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null,
  description text not null default '',
  category    text not null,
  target_date text not null,
  status      text not null,
  priority    text not null,
  created_at  text not null,
  updated_at  text not null
);
create index if not exists goals_user_idx on public.goals(user_id);
create index if not exists goals_user_status_idx on public.goals(user_id, status);

-- ── subgoals ─────────────────────────────────────────────────────────────────
create table if not exists public.subgoals (
  id                      text primary key,
  user_id                 uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id                 text not null references public.goals(id) on delete cascade,
  title                   text not null,
  description             text not null default '',
  target_date             text,
  status                  text not null,
  requires_consistency    boolean not null default false,
  estimated_daily_minutes integer,
  "order"                 integer not null default 0,
  created_at              text not null,
  updated_at              text not null
);
create index if not exists subgoals_user_idx on public.subgoals(user_id);
create index if not exists subgoals_goal_idx on public.subgoals(goal_id);

-- ── milestones ───────────────────────────────────────────────────────────────
create table if not exists public.milestones (
  id           text primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subgoal_id   text not null references public.subgoals(id) on delete cascade,
  title        text not null,
  description  text,
  status       text not null,
  "order"      integer not null default 0,
  ai_suggested boolean not null default false,
  completed_at text,
  created_at   text not null
);
create index if not exists milestones_user_idx on public.milestones(user_id);
create index if not exists milestones_subgoal_idx on public.milestones(subgoal_id);

-- ── tasks ────────────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id                text primary key,
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subgoal_id        text not null references public.subgoals(id) on delete cascade,
  milestone_id      text references public.milestones(id) on delete set null,
  title             text not null,
  description       text,
  status            text not null,
  priority          text not null,
  due_date          text,
  scheduled_date    text,
  estimated_minutes integer,
  effort            text,
  is_recurring      boolean not null default false,
  completed_at      text,
  reschedule_count  integer not null default 0,
  "order"           integer not null default 0,
  created_at        text not null,
  updated_at        text not null
);
create index if not exists tasks_user_idx on public.tasks(user_id);
create index if not exists tasks_subgoal_idx on public.tasks(subgoal_id);
create index if not exists tasks_milestone_idx on public.tasks(milestone_id);
create index if not exists tasks_user_scheduled_idx on public.tasks(user_id, scheduled_date);
create index if not exists tasks_user_status_idx on public.tasks(user_id, status);

-- ── dependencies ─────────────────────────────────────────────────────────────
-- Polymorphic edges: from_id/to_id reference a subgoal OR a task per `type`, so no
-- endpoint FKs (the app prunes dangling edges). Only the user cascade applies.
create table if not exists public.dependencies (
  id         text primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  from_id    text not null,
  to_id      text not null,
  type       text not null,
  created_at text not null
);
create index if not exists dependencies_user_idx on public.dependencies(user_id);
create index if not exists dependencies_user_type_idx on public.dependencies(user_id, type);

-- ── user_profiles ────────────────────────────────────────────────────────────
-- The app's UserProfile (name / hours / timezone). ONE row per user, so user_id IS
-- the primary key and the local single-row 'me' id is dropped. Distinct from the
-- account `profiles` table in 0001 (edition / join year), which is left untouched.
create table if not exists public.user_profiles (
  user_id                 uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name                    text not null default '',
  available_hours_per_day integer not null default 4,
  timezone                text not null default '',
  created_at              text not null,
  updated_at              text not null
);

-- ── user_context ─────────────────────────────────────────────────────────────
-- The app's standing UserContext. Also one row per user (was a single fixed-id row).
create table if not exists public.user_context (
  user_id          uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  situation        text not null,
  situation_detail text,
  light_days       integer[] not null default '{}',
  best_time_of_day text not null,
  work_rhythm      text not null,
  about            text,
  created_at       text not null,
  updated_at       text not null
);

-- ── goal_context ─────────────────────────────────────────────────────────────
-- Per-goal intake + the stored Strategy Brief (jsonb). Keyed by goal_id (one per goal).
create table if not exists public.goal_context (
  goal_id            text primary key references public.goals(id) on delete cascade,
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  success_definition text,
  starting_level     text,
  prior_experience   text,
  deadline_hardness  text not null,
  motivation         text,
  learnings          text,
  strategy_brief     jsonb,
  created_at         text not null,
  updated_at         text not null
);
create index if not exists goal_context_user_idx on public.goal_context(user_id);

-- ── snapshots ────────────────────────────────────────────────────────────────
create table if not exists public.snapshots (
  id                        text primary key,
  user_id                   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id                   text not null references public.goals(id) on delete cascade,
  captured_at               text not null,
  goal_progress_percent     integer not null,
  completed_task_count      integer not null,
  total_task_count          integer not null,
  completed_milestone_count integer not null,
  total_milestone_count     integer not null
);
create index if not exists snapshots_user_idx on public.snapshots(user_id);
create index if not exists snapshots_goal_idx on public.snapshots(goal_id);

-- ── opportunities ────────────────────────────────────────────────────────────
create table if not exists public.opportunities (
  id               text primary key,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type             text not null,
  title            text not null,
  organization     text not null default '',
  description      text not null default '',
  deadline         text,
  start_date       text,
  end_date         text,
  url              text not null default '',
  location         text,
  relevance_score  integer,
  matched_goal_ids text[] not null default '{}',
  tags             text[] not null default '{}',
  source           text not null,
  added_to_roadmap boolean not null default false,
  dismissed        boolean not null default false,
  saved_at         text not null
);
create index if not exists opportunities_user_idx on public.opportunities(user_id);

-- ── Row-Level Security ───────────────────────────────────────────────────────
-- Uniform: every table has a user_id column, so one FOR-ALL owner policy per table
-- (read + write scoped to auth.uid() = user_id) is all that's needed. Applied in a
-- loop so the set stays consistent and easy to extend.
do $$
declare
  t text;
begin
  foreach t in array array[
    'goals','subgoals','milestones','tasks','dependencies',
    'user_profiles','user_context','goal_context','snapshots','opportunities'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_all_own', t);
    execute format(
      'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id);',
      t || '_all_own', t
    );
  end loop;
end $$;
