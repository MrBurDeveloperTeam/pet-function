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
