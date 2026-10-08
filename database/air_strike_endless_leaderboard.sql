-- REVIEW ONLY. Run manually AFTER air_strike_campaign_cloud.sql.
-- Sky Patrol exclusive names: does not modify any cat_dash_* table or RPC.
begin;
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

-- Only confirmed campaign save writes publish rankings; clients cannot write this table.
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
-- Include existing cloud saves; repeat installations never replace an equal/higher best.
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
