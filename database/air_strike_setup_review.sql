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

-- Run manually AFTER air_strike_progress.sql. Codex does not execute this file.
-- Aircraft appearance is independent of flight XP; upgrades use the EXISTING pet wallet.
-- No extra flight-coin wallet is created. This does not modify pet levels or balances.
begin;
alter table public.air_strike_progress
 add column if not exists aircraft_tier integer not null default 1 check (aircraft_tier between 1 and 10);
comment on column public.air_strike_progress.aircraft_tier is
 'Aircraft appearance tier 1-10, purchased with existing pet wallet coins; independent of flight_level';
commit;
-- Current application stores aircraft_tier locally and uses existing confirmed spendCoins.
-- This column prepares future cloud persistence; executing this SQL does not enable sync.

-- Run manually in Supabase SQL Editor after air_strike_progress.sql.
-- Codex does not execute this migration. Current talent purchases/save are local.
-- This prepares a future cloud-save column only; it does not enable sync or spend coins.
begin;
alter table public.air_strike_progress
 add column if not exists unlocked_talents integer[] not null default '{}';
alter table public.air_strike_progress drop constraint if exists air_strike_talents_valid;
alter table public.air_strike_progress add constraint air_strike_talents_valid
 check (cardinality(unlocked_talents) <= 15 and array_position(unlocked_talents,null) is null
 and unlocked_talents <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]);
comment on column public.air_strike_progress.unlocked_talents is
 'Purchased permanent Sky Patrol talent IDs. Uses existing pet wallet; cloud sync not yet enabled.';
commit;

-- REVIEW ONLY. Run manually, if desired, AFTER air_strike_progress.sql.
-- Codex does not connect to Supabase or execute this file.
-- Optional future cloud-save fields: current campaign and talent saves are local.
-- No pet wallet, pet XP, pet level, RLS or RPC changes are made here.
begin;
alter table public.air_strike_progress
 add column if not exists highest_cleared_stage integer not null default 0,
 add column if not exists endless_best_wave integer not null default 0;
alter table public.air_strike_progress drop constraint if exists air_strike_campaign_stage_valid;
alter table public.air_strike_progress add constraint air_strike_campaign_stage_valid
 check (highest_cleared_stage between 0 and 100);
alter table public.air_strike_progress drop constraint if exists air_strike_endless_wave_valid;
alter table public.air_strike_progress add constraint air_strike_endless_wave_valid
 check (endless_best_wave between 0 and 100000);
comment on column public.air_strike_progress.highest_cleared_stage is
 'Highest normal stage cleared, 0-100. Clear 100 unlocks endless. Cloud sync not enabled.';
comment on column public.air_strike_progress.endless_best_wave is
 'Highest endless wave reached. Client-local until an explicit cloud integration is deployed.';
commit;

