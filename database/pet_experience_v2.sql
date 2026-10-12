-- Apply before deploying the new cat experience client. Existing levels and XP
-- are retained; this introduces a separate RPC so old clients keep working.
begin;
create or replace function public.pet_xp_required(p_level integer)
returns bigint language sql immutable strict set search_path='' as $$
 select 100::bigint + 20::bigint*greatest(0,p_level-1)
        + 2::bigint*greatest(0,p_level-1)*greatest(0,p_level-1);
$$;

create or replace function public.add_pet_xp_v2(p_delta integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid := auth.uid();
 pet record;
 next_xp bigint;
 next_level integer;
 gained integer := 0;
 next_coins bigint;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if p_delta is null or p_delta < 0 or p_delta > 1000000 then
  raise exception 'Invalid XP delta';
 end if;
 select p.xp,p.level,p.coins into pet from public.inventory_pet p
  where p.user_id=uid for update;
 if not found then raise exception 'Pet not found'; end if;
 next_xp := greatest(0,coalesce(pet.xp,0))::bigint+p_delta;
 next_level := greatest(1,coalesce(pet.level,1));
 while next_xp >= public.pet_xp_required(next_level) loop
  next_xp := next_xp-public.pet_xp_required(next_level);
  next_level := next_level+1;
  gained := gained+1;
 end loop;
 next_coins := coalesce(pet.coins,0)::bigint+50::bigint*gained;
 update public.inventory_pet set xp=next_xp,level=next_level,coins=next_coins
  where user_id=uid;
 return jsonb_build_object('out_xp',next_xp,'out_level',next_level,
  'out_levels_gained',gained,'out_coins',next_coins);
end;
$$;
revoke all on function public.add_pet_xp_v2(integer) from public,anon;
grant execute on function public.add_pet_xp_v2(integer) to authenticated;
commit;
