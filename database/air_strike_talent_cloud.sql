-- REVIEW AND RUN MANUALLY ONLY. Codex has not executed this migration.
-- Standalone talent cloud migration; earlier progress/campaign SQL is not required.
-- Requires the EXISTING public.inventory_pet wallet (user_id, coins) and
-- public.mutate_pet_coins(integer) used by the current cat wallet.
-- Does not migrate unverified browser purchases automatically.
begin;
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
commit;

-- OPTIONAL MANUAL MIGRATION, ONLY AFTER REVIEWING OLD PURCHASES:
-- Replace the UUID and talent list yourself, then execute this separate statement.
-- Do NOT run the example unchanged; it is intentionally commented out.
-- insert into public.air_strike_talent_ownership(user_id,talents)
-- values('YOUR-AUTH-USER-UUID'::uuid,array[1,2,3])
-- on conflict(user_id) do update set talents=(
--  select array_agg(distinct id order by id)
--  from unnest(public.air_strike_talent_ownership.talents || excluded.talents) as items(id)
-- ),updated_at=now();
