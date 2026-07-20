-- ADR-0003 step 4 — Billing/quota: per-user monthly AI usage meter.
-- Run after 0002. The edge AI proxy (api/ai.ts) calls consume_ai_quota() on every
-- request, AFTER verifying the JWT, to enforce a free-tier cap. This is the single
-- place usage is counted; a paid tier later just raises the limit passed in.

-- ── ai_usage ─────────────────────────────────────────────────────────────────
-- One row per (user, calendar month). `period` is 'YYYY-MM'. RLS scopes every row
-- to its owner, like every other app table.
create table if not exists public.ai_usage (
  user_id uuid    not null default auth.uid() references auth.users(id) on delete cascade,
  period  text    not null,           -- 'YYYY-MM'
  count   integer not null default 0,
  primary key (user_id, period)
);

alter table public.ai_usage enable row level security;
drop policy if exists ai_usage_all_own on public.ai_usage;
create policy ai_usage_all_own on public.ai_usage for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── consume_ai_quota(limit) ──────────────────────────────────────────────────
-- Atomically: ensure the current month's row exists, read it under a row lock, and
-- increment ONLY if still under the limit. Returns whether the call is allowed plus
-- the (post-increment) used count and the limit, so the proxy can 429 with a clear
-- message. SECURITY INVOKER + RLS means a caller can only ever touch their own row,
-- and auth.uid() resolves from their JWT. The FOR UPDATE lock makes concurrent
-- requests serialise, so the cap can't be overshot by racing calls.
create or replace function public.consume_ai_quota(p_limit integer)
returns table(allowed boolean, used integer, quota_limit integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_period text := to_char(now(), 'YYYY-MM');
  v_used   integer;
begin
  insert into public.ai_usage(user_id, period, count)
  values (auth.uid(), v_period, 0)
  on conflict (user_id, period) do nothing;

  select count into v_used
    from public.ai_usage
   where user_id = auth.uid() and period = v_period
   for update;

  if v_used >= p_limit then
    return query select false, v_used, p_limit;
  else
    update public.ai_usage set count = count + 1
     where user_id = auth.uid() and period = v_period;
    return query select true, v_used + 1, p_limit;
  end if;
end;
$$;

grant execute on function public.consume_ai_quota(integer) to authenticated;
