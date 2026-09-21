begin;

create table if not exists public.pet_game_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null check (game_id in ('flappy', 'paccat', 'tetris')),
  progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

alter table public.pet_game_progress enable row level security;

drop policy if exists "Users can read their own game progress" on public.pet_game_progress;
create policy "Users can read their own game progress"
on public.pet_game_progress for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.pet_game_progress from public, anon, authenticated;
grant select on table public.pet_game_progress to authenticated;
grant all on table public.pet_game_progress to service_role;

create or replace function public.pet_game_progress_sync(
  p_game_id text,
  p_progress jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  stored jsonb := '{}'::jsonb;
  incoming jsonb := coalesce(p_progress, '{}'::jsonb);
  merged jsonb;
  merged_highscore bigint;
  merged_leaderboard jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_game_id not in ('flappy', 'paccat', 'tetris') then
    raise exception 'Unsupported game';
  end if;

  insert into public.pet_game_progress (user_id, game_id, progress)
  values (current_user_id, p_game_id, '{}'::jsonb)
  on conflict (user_id, game_id) do nothing;

  select progress into stored
  from public.pet_game_progress
  where user_id = current_user_id and game_id = p_game_id
  for update;

  merged_highscore := greatest(
    0,
    coalesce((stored ->> 'highscore')::bigint, 0),
    coalesce((incoming ->> 'highscore')::bigint, 0)
  );

  if p_game_id = 'tetris' then
    select coalesce(jsonb_agg(score order by score desc), '[]'::jsonb)
    into merged_leaderboard
    from (
      select distinct greatest(0, value::bigint) as score
      from jsonb_array_elements_text(
        coalesce(stored -> 'leaderboard', '[]'::jsonb) ||
        coalesce(incoming -> 'leaderboard', '[]'::jsonb) ||
        jsonb_build_array(merged_highscore)
      )
      order by score desc
      limit 3
    ) scores;
    merged := jsonb_build_object(
      'highscore', merged_highscore,
      'leaderboard', merged_leaderboard
    );
  else
    merged := jsonb_build_object('highscore', merged_highscore);
  end if;

  update public.pet_game_progress
  set progress = merged, updated_at = now()
  where user_id = current_user_id and game_id = p_game_id;

  return merged;
end;
$$;

revoke all on function public.pet_game_progress_sync(text, jsonb) from public, anon;
grant execute on function public.pet_game_progress_sync(text, jsonb) to authenticated;

commit;
