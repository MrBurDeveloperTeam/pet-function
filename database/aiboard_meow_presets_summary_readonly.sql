-- READ ONLY: run this entire statement in the correct Supabase SQL Editor.
-- One result set contains every check, so a final SELECT cannot hide earlier checks.
-- Only metadata is read: no private messages, auth records, DDL or data mutations.
-- Required: config user_id UNIQUE; UUID message/timing IDs; owned-config child FKs;
-- authenticated per-owner CRUD policies; enabled RLS; no unnecessary API-role grants.
with targets(table_name) as (
  values ('aiboard_meow_configs'), ('aiboard_meow_messages'), ('aiboard_meow_timing')
), metadata as (
  select '01_tables' as check_name, t.table_name as object_name,
         jsonb_build_object(
           'exists', c.oid is not null,
           'rls_enabled', c.relrowsecurity,
           'rls_forced', c.relforcerowsecurity,
           'policy_count', (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.table_name),
           'constraint_count', (select count(*) from pg_constraint k where k.conrelid = c.oid),
           'missing_columns', (select coalesce(jsonb_agg(required.column_name order by required.column_name), '[]'::jsonb)
             from unnest(case t.table_name
               when 'aiboard_meow_configs' then array['id', 'user_id']
               when 'aiboard_meow_messages' then array['id', 'config_id', 'state', 'message', 'is_audio', 'audio_name', 'sort_order']
               else array['id', 'config_id', 'state', 'message_duration_minutes', 'message_interval_minutes', 'disabled', 'updated_at']
             end) as required(column_name)
             where not exists (select 1 from information_schema.columns actual
               where actual.table_schema = 'public' and actual.table_name = t.table_name
                 and actual.column_name = required.column_name))
         ) as details
  from targets t
  left join pg_namespace n on n.nspname = 'public'
  left join pg_class c on c.relnamespace = n.oid and c.relname = t.table_name

  union all
  select '02_columns', col.table_name || '.' || col.column_name,
         jsonb_build_object('data_type', col.data_type, 'udt_name', col.udt_name,
                           'nullable', col.is_nullable, 'default', col.column_default)
  from information_schema.columns col
  join targets t on t.table_name = col.table_name
  where col.table_schema = 'public'

  union all
  select '03_constraints', c.relname || '.' || k.conname,
         jsonb_build_object('type', k.contype, 'definition', pg_get_constraintdef(k.oid))
  from pg_constraint k
  join pg_class c on c.oid = k.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  join targets t on t.table_name = c.relname
  where n.nspname = 'public'

  union all
  select '04_indexes', i.tablename || '.' || i.indexname,
         jsonb_build_object('definition', i.indexdef)
  from pg_indexes i
  join targets t on t.table_name = i.tablename
  where i.schemaname = 'public'

  union all
  select '05_policies', p.tablename || '.' || p.policyname,
         jsonb_build_object('permissive', p.permissive, 'roles', p.roles,
                           'command', p.cmd, 'using', p.qual, 'with_check', p.with_check)
  from pg_policies p
  join targets t on t.table_name = p.tablename
  where p.schemaname = 'public'

  union all
  select '06_grants', g.table_name || '.' || g.grantee,
         jsonb_build_object('privileges', jsonb_agg(g.privilege_type order by g.privilege_type))
  from information_schema.role_table_grants g
  join targets t on t.table_name = g.table_name
  where g.table_schema = 'public'
  group by g.table_name, g.grantee
)
select check_name, object_name, details
from metadata
order by check_name, object_name;
