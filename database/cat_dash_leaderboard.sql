begin;

create table if not exists public.cat_dash_runs (
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id text not null check (length(run_id) between 1 and 100),
  teeth bigint not null check (teeth >= 0),
  elapsed_seconds double precision not null check (elapsed_seconds between 0 and 86400),
  created_at timestamptz not null default now(),
  primary key (user_id, run_id)
);
create table if not exists public.cat_dash_bests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  teeth bigint not null,
  achieved_at timestamptz not null default now()
);
create index if not exists cat_dash_bests_ranking on public.cat_dash_bests (teeth desc, achieved_at, user_id);
alter table public.cat_dash_runs enable row level security;
alter table public.cat_dash_bests enable row level security;
revoke all on public.cat_dash_runs, public.cat_dash_bests from public, anon, authenticated;
grant all on public.cat_dash_runs, public.cat_dash_bests to service_role;

create or replace function public.cat_dash_submit_run(p_run_id text, p_teeth bigint, p_elapsed_seconds double precision)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  player_name text;
  inserted_count integer;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_run_id is null or length(p_run_id) not between 1 and 100
    or p_teeth is null or p_teeth < 0
    or p_elapsed_seconds is null or not (p_elapsed_seconds between 0 and 86400)
    or p_teeth > p_elapsed_seconds * 30 + 60 then raise exception 'Invalid run'; end if;
  select left(coalesce(nullif(raw_user_meta_data->>'display_name',''), nullif(raw_user_meta_data->>'full_name',''), nullif(raw_user_meta_data->>'name',''), 'Runner'),40)
    into player_name from auth.users where id=owner_id;
  insert into public.cat_dash_runs(user_id,run_id,teeth,elapsed_seconds)
    values(owner_id,p_run_id,p_teeth,p_elapsed_seconds) on conflict do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count > 0 then
    insert into public.cat_dash_bests as best(user_id,display_name,teeth)
      values(owner_id,player_name,p_teeth)
      on conflict(user_id) do update set teeth=excluded.teeth, display_name=excluded.display_name, achieved_at=now()
      where excluded.teeth > best.teeth;
  end if;
  return jsonb_build_object('best',(select teeth from public.cat_dash_bests where user_id=owner_id));
end;
$$;

create or replace function public.cat_dash_leaderboard()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  with ranked as (
    select row_number() over(order by teeth desc,achieved_at,user_id) as rank,
      user_id,display_name,teeth from public.cat_dash_bests
  ), visible as (select * from ranked where rank<=20 or user_id=auth.uid())
  select jsonb_build_object('scope','global','entries',coalesce(jsonb_agg(jsonb_build_object(
    'rank',rank,'name',display_name,'teeth',teeth,'isYou',user_id=auth.uid()) order by rank),'[]'::jsonb))
    into result from visible;
  return result;
end;
$$;
revoke all on function public.cat_dash_submit_run(text,bigint,double precision), public.cat_dash_leaderboard() from public, anon;
grant execute on function public.cat_dash_submit_run(text,bigint,double precision), public.cat_dash_leaderboard() to authenticated;
commit;
