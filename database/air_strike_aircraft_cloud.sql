-- Review and execute manually. Requires air_strike_progress.sql and air_strike_aircraft_upgrade.sql.
begin;
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
commit;
