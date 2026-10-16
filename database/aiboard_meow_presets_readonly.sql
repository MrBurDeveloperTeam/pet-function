-- READ ONLY: inspect the existing AIBoard schema before enabling cloud presets.
-- Run each SELECT in Supabase SQL Editor. No user messages or auth records are read.
-- This file creates no tables/policies, grants no privileges and changes no data.

-- All three tables should exist and have RLS enabled.
select expected.table_name,
       case when c.oid is null then 'MISSING' else 'PRESENT' end as status,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from (values
  ('aiboard_meow_configs'),
  ('aiboard_meow_messages'),
  ('aiboard_meow_timing')
) as expected(table_name)
left join pg_namespace n on n.nspname = 'public'
left join pg_class c on c.relnamespace = n.oid and c.relname = expected.table_name
order by expected.table_name;

-- Required config columns: id, user_id.
-- Required message columns: id, config_id, state, message, is_audio, audio_name, sort_order.
-- Required timing columns: id, config_id, state, message_duration_minutes,
--                          message_interval_minutes, disabled, updated_at.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('aiboard_meow_configs', 'aiboard_meow_messages', 'aiboard_meow_timing')
order by table_name, ordinal_position;

-- Verify config user_id is unique, message id is a primary/unique key,
-- message/timing id columns must accept client-generated UUIDs for retry recovery,
-- and child config_id foreign keys point to aiboard_meow_configs(id).
select c.relname as table_name, con.conname as constraint_name,
       con.contype as constraint_type, pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('aiboard_meow_configs', 'aiboard_meow_messages', 'aiboard_meow_timing')
order by c.relname, con.conname;

-- Also capture unique indexes that may enforce ownership keys independently.
select tablename as table_name, indexname as index_name, indexdef as definition
from pg_indexes
where schemaname = 'public'
  and tablename in ('aiboard_meow_configs', 'aiboard_meow_messages', 'aiboard_meow_timing')
order by tablename, indexname;

-- Policies must scope config rows to auth.uid() = user_id and child rows to
-- a config owned by auth.uid(). UPDATE needs SELECT plus USING and WITH CHECK.
select tablename as table_name, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('aiboard_meow_configs', 'aiboard_meow_messages', 'aiboard_meow_timing')
order by tablename, policyname;

-- Confirm authenticated clients have the required privileges, with RLS above.
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('aiboard_meow_configs', 'aiboard_meow_messages', 'aiboard_meow_timing')
order by table_name, grantee, privilege_type;
