-- Run manually in Supabase SQL Editor. This migration is NOT executed by Codex.
-- Independent Sky Patrol save: no joins, triggers or updates to pet levels/coins/XP.
-- The current UI uses per-user local saves. Cloud sync is not enabled yet.
begin;
create table if not exists public.air_strike_progress (
 user_id uuid primary key references auth.users(id) on delete cascade,
 flight_xp integer not null default 0 check (flight_xp between 0 and 8100),
 flight_level integer generated always as (least(10,1+floor(sqrt(flight_xp::numeric/100))::integer)) stored,
 best_score integer not null default 0 check (best_score between 0 and 1000000),
 completed_runs integer not null default 0 check (completed_runs between 0 and 1000000),
 updated_at timestamptz not null default now()
);
alter table public.air_strike_progress enable row level security;
drop policy if exists "Read own flight progress" on public.air_strike_progress;
create policy "Read own flight progress" on public.air_strike_progress
 for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.air_strike_progress from public,anon,authenticated;
grant select on public.air_strike_progress to authenticated;
grant all on public.air_strike_progress to service_role;

-- Future opt-in sync of client-reported arcade progress, not an anti-cheat endpoint.
create or replace function public.air_strike_progress_sync(p_xp integer,p_best integer,p_runs integer)
returns public.air_strike_progress language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); saved public.air_strike_progress;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if p_xp is null or p_best is null or p_runs is null or p_xp not between 0 and 8100
  or p_best not between 0 and 1000000 or p_runs not between 0 and 1000000 then
  raise exception 'Invalid flight progress';
 end if;
 insert into public.air_strike_progress(user_id,flight_xp,best_score,completed_runs)
 values(uid,p_xp,p_best,p_runs)
 on conflict(user_id) do update set
  flight_xp=greatest(air_strike_progress.flight_xp,excluded.flight_xp),
  best_score=greatest(air_strike_progress.best_score,excluded.best_score),
  completed_runs=greatest(air_strike_progress.completed_runs,excluded.completed_runs),
  updated_at=now()
 returning * into saved;
 return saved;
end;
$$;
revoke all on function public.air_strike_progress_sync(integer,integer,integer) from public,anon;
grant execute on function public.air_strike_progress_sync(integer,integer,integer) to authenticated;
commit;
