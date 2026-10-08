import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../database/',import.meta.url);
const parts=['air_strike_progress.sql','air_strike_aircraft_upgrade.sql','air_strike_aircraft_cloud.sql','air_strike_talent_cloud.sql','air_strike_campaign_cloud.sql','air_strike_endless_leaderboard.sql'];
const header=`-- FULL SKY PATROL CLOUD INSTALLATION — REVIEW AND EXECUTE MANUALLY ONLY.
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
`;
const sections=parts.map(name=>`\n-- SECTION: ${name}\n`+readFileSync(new URL(name,root),'utf8').replace(/^--.*\r?$/gm,'').replace(/^(?:begin;|commit;)\r?$/gm,'').trim());
const target=new URL('air_strike_complete_install.sql',root);
writeFileSync(target,header+sections.join('\n')+'\ncommit;\n');
process.stdout.write(fileURLToPath(target)+'\n');
