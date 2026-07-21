-- Stage 3 (health) — slip_events: the reschedule reason log. Run after 0002.
-- Mirrors the local `slipEvents` Dexie store. One row per task moved per reschedule,
-- user-scoped + RLS like every other app table. `at` is TEXT (ISO), matching the
-- rest of the schema, so the pattern engine's time windows compare lexicographically.
create table if not exists public.slip_events (
  id      text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- No FK on task_id: a slip is historical, so its record should outlive the task
  -- being deleted (the goal cascade below still clears it when the goal is removed).
  task_id text not null,
  goal_id text not null references public.goals(id) on delete cascade,
  reason  text not null,
  at      text not null
);
create index if not exists slip_events_user_idx on public.slip_events(user_id);
create index if not exists slip_events_goal_idx on public.slip_events(goal_id);
create index if not exists slip_events_at_idx on public.slip_events(user_id, at);

alter table public.slip_events enable row level security;
drop policy if exists slip_events_all_own on public.slip_events;
create policy slip_events_all_own on public.slip_events for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
