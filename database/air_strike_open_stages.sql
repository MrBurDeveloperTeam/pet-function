-- Review and run manually in Supabase SQL Editor. Codex does not deploy this.
-- Removes only the normal-stage order restriction. Existing rewards, idempotency,
-- wallet transaction and Endless unlock rule are preserved.
begin;
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
revoke all on function public.air_strike_campaign_record(uuid,integer,text,text,integer) from public,anon;
grant execute on function public.air_strike_campaign_record(uuid,integer,text,text,integer) to authenticated;
commit;
