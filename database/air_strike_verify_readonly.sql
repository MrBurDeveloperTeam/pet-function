-- Optional manual inspection in Supabase SQL Editor. Codex has NOT executed this.
-- Replace REPLACE_WITH_ACCOUNT_UUID with the user's UUID from Authentication > Users.
-- Read-only: no purchases, rewards, unlocks, rankings or wallet data are changed.
begin transaction read only;

with account as (select 'REPLACE_WITH_ACCOUNT_UUID'::uuid as user_id)
select p.user_id, p.aircraft_tier, p.flight_xp, p.flight_level,
       p.best_score, p.completed_runs, t.talents,
       c.highest_cleared, c.endless_best, w.coins
from account a
left join public.air_strike_progress p on p.user_id = a.user_id
left join public.air_strike_talent_ownership t on t.user_id = a.user_id
left join public.air_strike_campaign_saves c on c.user_id = a.user_id
left join public.inventory_pet w on w.user_id = a.user_id;

select stage, mode, rewarded_wave, finished, updated_at
from public.air_strike_campaign_runs
where user_id = 'REPLACE_WITH_ACCOUNT_UUID'::uuid
order by updated_at desc;

select best_wave, achieved_at
from public.air_strike_endless_bests
where user_id = 'REPLACE_WITH_ACCOUNT_UUID'::uuid;

-- Expected for the tested account after stage 1 clear:
-- aircraft_tier = 2, talents = {1}, flight_xp = 163, flight_level = 2,
-- best_score = 6375, completed_runs = 3, highest_cleared = 1, coins = 3871.
-- Endless has not been unlocked/tested; no leaderboard row is expected yet.
-- Later genuine play or purchases will legitimately change these expected values.
commit;
