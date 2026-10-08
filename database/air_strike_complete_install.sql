-- FULL SKY PATROL CLOUD INSTALLATION — REVIEW AND EXECUTE MANUALLY ONLY.
-- Codex has not connected to Supabase or run this SQL.
-- Safe to repeat with the earlier aircraft upgrade migration already installed.
-- Uses existing cat coins: no new wallet, no changes to cat level/XP, no cat_dash changes.
-- Existing browser purchases are NOT automatically imported or charged again.
begin;
do $$
begin
 if to_regclass('public.inventory_pet') is null then raise exception 'Missing existing cat wallet: public.inventory_pet'; end if;
 if to_regprocedure('public.mutate_pet_coins(integer)') is null then raise exception 'Missing existing cat wallet RPC: public.mutate_pet_coins(integer)'; end if;
 if to_regclass('public.profiles') is null then raise exception 'Missing existing public.profiles for leaderboard display'; end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='inventory_pet' and column_name='user_id')
  or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='inventory_pet' and column_name='coins') then
  raise exception 'Existing inventory_pet must have user_id and coins columns';
 end if;
end;
$$;

-- SECTION: air_strike_progress.sql
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

-- SECTION: air_strike_aircraft_upgrade.sql
alter table public.air_strike_progress
 add column if not exists aircraft_tier integer not null default 1 check (aircraft_tier between 1 and 10);
comment on column public.air_strike_progress.aircraft_tier is
 'Aircraft appearance tier 1-10, purchased with existing pet wallet coins; independent of flight_level';

-- SECTION: air_strike_aircraft_cloud.sql
create or replace function public.air_strike_aircraft_get()
returns integer language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); tier integer;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 select p.aircraft_tier into tier from public.air_strike_progress p where p.user_id=uid;
 return coalesce(tier,1);
end;
$$;
create or replace function public.air_strike_aircraft_purchase(p_target integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); tier integer; balance bigint; price integer;
 prices constant integer[]:=array[100,200,350,550,800,1100,1500,2000,2600];
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if p_target is null or p_target not between 2 and 10 then raise exception 'Invalid aircraft tier'; end if;
 insert into public.air_strike_progress(user_id) values(uid) on conflict(user_id) do nothing;
 select p.aircraft_tier into tier from public.air_strike_progress p where p.user_id=uid for update;
 select p.coins::bigint into balance from public.inventory_pet p where p.user_id=uid for update;
 if balance is null then raise exception 'Pet wallet not found'; end if;
 -- Repeating a lost response for the same requested tier never buys the next tier.
 if tier>=p_target then return jsonb_build_object('tier',tier,'coins',balance); end if;
 if p_target<>tier+1 then raise exception 'Upgrade aircraft in order'; end if;
 price:=prices[tier];
 if balance<price then raise exception 'Insufficient pet coins'; end if;
 select public.mutate_pet_coins(-price)::bigint into balance;
 if balance is null or balance<0 then raise exception 'Invalid wallet result'; end if;
 update public.air_strike_progress set aircraft_tier=p_target,updated_at=now() where user_id=uid;
 return jsonb_build_object('tier',p_target,'coins',balance);
end;
$$;
revoke all on function public.air_strike_aircraft_get() from public,anon;
revoke all on function public.air_strike_aircraft_purchase(integer) from public,anon;
grant execute on function public.air_strike_aircraft_get() to authenticated;
grant execute on function public.air_strike_aircraft_purchase(integer) to authenticated;

-- SECTION: air_strike_talent_cloud.sql
create table if not exists public.air_strike_talent_ownership (
 user_id uuid primary key references auth.users(id) on delete cascade,
 talents integer[] not null default '{}',
 updated_at timestamptz not null default now(),
 constraint sky_talents_valid check (cardinality(talents)<=15
  and array_position(talents,null) is null
  and talents <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15])
);
alter table public.air_strike_talent_ownership enable row level security;
drop policy if exists "Read own Sky Patrol talents" on public.air_strike_talent_ownership;
create policy "Read own Sky Patrol talents" on public.air_strike_talent_ownership
 for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.air_strike_talent_ownership from public,anon,authenticated;
grant select on public.air_strike_talent_ownership to authenticated;
grant all on public.air_strike_talent_ownership to service_role;

create or replace function public.air_strike_talents_get()
returns integer[] language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); owned integer[];
begin
 if uid is null then raise exception 'Authentication required'; end if;
 select t.talents into owned from public.air_strike_talent_ownership t where t.user_id=uid;
 return coalesce(owned,'{}'::integer[]);
end;
$$;

create or replace function public.air_strike_talent_purchase(p_talent_id integer)
returns table(out_talents integer[],out_coins bigint)
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); owned integer[]; price integer; balance bigint;
 prices constant integer[]:=array[100,200,300,400,500,600,700,800,1400,2000,2600,3200,3800,4400,5000];
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if p_talent_id is null or p_talent_id not between 1 and 15 then raise exception 'Invalid talent'; end if;
 insert into public.air_strike_talent_ownership(user_id) values(uid) on conflict(user_id) do nothing;
 -- Serializes concurrent same-account purchases before touching the shared wallet.
 select t.talents into owned from public.air_strike_talent_ownership t where t.user_id=uid for update;
 if p_talent_id=any(owned) then
  select p.coins::bigint into balance from public.inventory_pet p where p.user_id=uid;
  if balance is null then raise exception 'Pet wallet not found'; end if;
  return query select owned,balance;
  return;
 end if;
 if exists(select 1 from generate_series(1,p_talent_id-1) as prior(id) where not prior.id=any(owned)) then
  raise exception 'Unlock talents in order';
 end if;
 price:=prices[p_talent_id];
 select p.coins::bigint into balance from public.inventory_pet p where p.user_id=uid for update;
 if balance is null then raise exception 'Pet wallet not found'; end if;
 if balance<price then raise exception 'Insufficient pet coins'; end if;
 -- Existing wallet enforces affordability. Any exception rolls back BOTH changes.
 select public.mutate_pet_coins(-price)::bigint into balance;
 if balance is null or balance<0 then raise exception 'Invalid wallet result'; end if;
 select array_agg(id order by id) into owned from (select distinct unnest(owned || p_talent_id) as id) as ids;
 update public.air_strike_talent_ownership set talents=owned,updated_at=now() where user_id=uid;
 return query select owned,balance;
end;
$$;
revoke all on function public.air_strike_talents_get() from public,anon;
revoke all on function public.air_strike_talent_purchase(integer) from public,anon;
grant execute on function public.air_strike_talents_get() to authenticated;
grant execute on function public.air_strike_talent_purchase(integer) to authenticated;
comment on table public.air_strike_talent_ownership is
 'Server-authoritative purchased Sky Patrol talents; grants only through atomic wallet purchase.';

-- SECTION: air_strike_campaign_cloud.sql
create table if not exists public.air_strike_campaign_saves (
 user_id uuid primary key references auth.users(id) on delete cascade,
 highest_cleared integer not null default 0 check(highest_cleared between 0 and 100),
 endless_best integer not null default 0 check(endless_best between 0 and 100000),
 updated_at timestamptz not null default now()
);
create table if not exists public.air_strike_campaign_runs (
 user_id uuid not null references auth.users(id) on delete cascade,
 run_token uuid not null,
 stage integer not null check(stage between 1 and 100),
 mode text not null check(mode in ('campaign','endless')),
 rewarded_wave integer not null default 0 check(rewarded_wave between 0 and 100000),
 finished boolean not null default false,
 updated_at timestamptz not null default now(),
 primary key(user_id,run_token)
);
alter table public.air_strike_campaign_saves enable row level security;
alter table public.air_strike_campaign_runs enable row level security;
drop policy if exists "Read own Sky Patrol campaign" on public.air_strike_campaign_saves;
create policy "Read own Sky Patrol campaign" on public.air_strike_campaign_saves
 for select to authenticated using((select auth.uid())=user_id);
drop policy if exists "Read own Sky Patrol settlements" on public.air_strike_campaign_runs;
create policy "Read own Sky Patrol settlements" on public.air_strike_campaign_runs
 for select to authenticated using((select auth.uid())=user_id);
revoke all on public.air_strike_campaign_saves,public.air_strike_campaign_runs from public,anon,authenticated;
grant select on public.air_strike_campaign_saves,public.air_strike_campaign_runs to authenticated;
grant all on public.air_strike_campaign_saves,public.air_strike_campaign_runs to service_role;

create or replace function public.air_strike_campaign_get()
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); saved public.air_strike_campaign_saves;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 select * into saved from public.air_strike_campaign_saves where user_id=uid;
 return jsonb_build_object('highestCleared',coalesce(saved.highest_cleared,0),'endlessBest',coalesce(saved.endless_best,0));
end;
$$;


create or replace function public.air_strike_campaign_merge(p_highest integer,p_endless integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); saved public.air_strike_campaign_saves;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if p_highest is null or p_endless is null or p_highest not between 0 and 100 or p_endless not between 0 and 100000 then raise exception 'Invalid campaign save'; end if;
 insert into public.air_strike_campaign_saves(user_id,highest_cleared,endless_best)
 values(uid,p_highest,p_endless)
 on conflict(user_id) do update set
 highest_cleared=greatest(air_strike_campaign_saves.highest_cleared,excluded.highest_cleared),
 endless_best=greatest(air_strike_campaign_saves.endless_best,excluded.endless_best),updated_at=now()
 returning * into saved;
 return jsonb_build_object('highestCleared',saved.highest_cleared,'endlessBest',saved.endless_best);
end;
$$;

create or replace function public.air_strike_campaign_record(p_run_token uuid,p_stage integer,p_mode text,p_outcome text,p_wave integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); saved public.air_strike_campaign_saves;
 played public.air_strike_campaign_runs; reward integer:=0; balance bigint; paid_wave integer;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if p_run_token is null or p_stage is null or p_stage not between 1 and 100
  or p_mode is null or p_mode not in ('campaign','endless') or p_outcome is null
  or p_outcome not in ('victory','defeat','checkpoint') or p_wave is null or p_wave not between 0 and 100000 then
  raise exception 'Invalid campaign result';
 end if;
 if p_mode='campaign' and (p_outcome='checkpoint' or p_wave<>0) then raise exception 'Invalid normal result'; end if;
 if p_mode='endless' and (p_stage<>100 or p_outcome='victory' or (p_outcome='checkpoint' and (p_wave=0 or p_wave%10<>0))) then raise exception 'Invalid endless result'; end if;
 insert into public.air_strike_campaign_saves(user_id) values(uid) on conflict(user_id) do nothing;
 -- One lock serializes first-clear decisions and rewards across all this user's devices.
 select * into saved from public.air_strike_campaign_saves where user_id=uid for update;
 if p_mode='endless' and saved.highest_cleared<100 then raise exception 'Endless locked'; end if;
 -- All normal stages are open; recommended power is advisory.
 insert into public.air_strike_campaign_runs(user_id,run_token,stage,mode) values(uid,p_run_token,p_stage,p_mode) on conflict(user_id,run_token) do nothing;
 select * into played from public.air_strike_campaign_runs where user_id=uid and run_token=p_run_token for update;
 if played.stage<>p_stage or played.mode<>p_mode then raise exception 'Run identity mismatch'; end if;
 if not played.finished then
  if p_mode='campaign' then
   if p_outcome='victory' then
    reward:=round(40*power(1.035::numeric,p_stage-1)*(case when p_stage>saved.highest_cleared then 1 else 0.35 end))::integer;
    saved.highest_cleared:=greatest(saved.highest_cleared,p_stage);
   end if;
   played.finished:=true;
  else
   paid_wave:=(p_wave/10)*10;
   reward:=greatest(0,(paid_wave-played.rewarded_wave)/10)*round(40*power(1.035::numeric,99)*0.35)::integer;
   played.rewarded_wave:=greatest(played.rewarded_wave,paid_wave);
   saved.endless_best:=greatest(saved.endless_best,p_wave);
   played.finished:=p_outcome='defeat';
  end if;
  -- Reward and record changes are one transaction. Failure rolls back everything.
  if reward>0 then select public.mutate_pet_coins(reward)::bigint into balance; end if;
  update public.air_strike_campaign_runs set rewarded_wave=played.rewarded_wave,finished=played.finished,updated_at=now()
   where user_id=uid and run_token=p_run_token;
  update public.air_strike_campaign_saves set highest_cleared=saved.highest_cleared,endless_best=saved.endless_best,updated_at=now() where user_id=uid;
 end if;
 if balance is null then select p.coins::bigint into balance from public.inventory_pet p where p.user_id=uid; end if;
 if balance is null or balance<0 then raise exception 'Pet wallet not found'; end if;
 return jsonb_build_object('highestCleared',saved.highest_cleared,'endlessBest',saved.endless_best,'coins',balance,'reward',reward);
end;
$$;
revoke all on function public.air_strike_campaign_get() from public,anon;
revoke all on function public.air_strike_campaign_merge(integer,integer) from public,anon;
revoke all on function public.air_strike_campaign_record(uuid,integer,text,text,integer) from public,anon;
grant execute on function public.air_strike_campaign_get() to authenticated;
grant execute on function public.air_strike_campaign_merge(integer,integer) to authenticated;
grant execute on function public.air_strike_campaign_record(uuid,integer,text,text,integer) to authenticated;

-- SECTION: air_strike_endless_leaderboard.sql
create table if not exists public.air_strike_endless_bests (
 user_id uuid primary key references auth.users(id) on delete cascade,
 best_wave integer not null check(best_wave between 1 and 100000),
 achieved_at timestamptz not null default now()
);
create index if not exists air_strike_endless_rank_idx on public.air_strike_endless_bests(best_wave desc,achieved_at,user_id);
alter table public.air_strike_endless_bests enable row level security;
drop policy if exists "Read own Sky Patrol endless best" on public.air_strike_endless_bests;
create policy "Read own Sky Patrol endless best" on public.air_strike_endless_bests
 for select to authenticated using((select auth.uid())=user_id);
revoke all on public.air_strike_endless_bests from public,anon,authenticated;
grant select on public.air_strike_endless_bests to authenticated;
grant all on public.air_strike_endless_bests to service_role;


create or replace function public.air_strike_publish_endless_best()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.endless_best>0 then
  insert into public.air_strike_endless_bests(user_id,best_wave) values(new.user_id,new.endless_best)
  on conflict(user_id) do update set best_wave=excluded.best_wave,achieved_at=now()
   where excluded.best_wave>air_strike_endless_bests.best_wave;
 end if;
 return new;
end;
$$;
revoke all on function public.air_strike_publish_endless_best() from public,anon,authenticated;
drop trigger if exists air_strike_endless_best_publish on public.air_strike_campaign_saves;
create trigger air_strike_endless_best_publish after insert or update of endless_best
 on public.air_strike_campaign_saves for each row execute function public.air_strike_publish_endless_best();

insert into public.air_strike_endless_bests(user_id,best_wave)
 select user_id,endless_best from public.air_strike_campaign_saves where endless_best>0
 on conflict(user_id) do update set best_wave=excluded.best_wave,achieved_at=now()
  where excluded.best_wave>air_strike_endless_bests.best_wave;

create or replace function public.air_strike_endless_leaderboard()
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 with ranked as (
  select row_number() over(order by best_wave desc,achieved_at,user_id) as rank,
   user_id,best_wave from public.air_strike_endless_bests
 ), visible as (select * from ranked where rank<=50 or user_id=uid)
 select coalesce(jsonb_agg(jsonb_build_object(
  'rank',v.rank,'userId',v.user_id,'wave',v.best_wave,'isYou',v.user_id=uid,
  'name',left(coalesce(nullif(to_jsonb(p)->>'name',''),nullif(to_jsonb(p)->>'full_name',''),
   nullif(u.raw_user_meta_data->>'display_name',''),nullif(u.raw_user_meta_data->>'full_name',''),
   nullif(u.raw_user_meta_data->>'name',''),'Pilot'),80),
  'avatarUrl',coalesce(nullif(to_jsonb(p)->>'avatar_url',''),nullif(u.raw_user_meta_data->>'avatar_url',''),nullif(u.raw_user_meta_data->>'picture',''))
 ) order by v.rank),'[]'::jsonb) into result
 from visible v join auth.users u on u.id=v.user_id
 left join lateral (
  select profile.* from public.profiles profile
  where to_jsonb(profile)->>'user_id'=v.user_id::text or to_jsonb(profile)->>'id'=v.user_id::text
  limit 1
 ) p on true;
 return jsonb_build_object('entries',result);
end;
$$;
revoke all on function public.air_strike_endless_leaderboard() from public,anon;
grant execute on function public.air_strike_endless_leaderboard() to authenticated;
commit;
