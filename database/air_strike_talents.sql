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
