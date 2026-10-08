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
