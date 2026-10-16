-- MANUAL PERMISSION REPAIR: review, then run yourself in Supabase SQL Editor.
-- THIS IS NOT THE READ-ONLY AUDIT. It changes access rules on exactly three tables.
-- Based on the user's 2026-10-16 metadata: keep existing owner_all and
-- team_readonly_select_all policies, direct service_role/admin grants and all rows.
-- Removes public preset browsing; older clients relying on a global first config
-- must migrate to the shared account-scoped implementation.
begin;

do $preflight$
declare
  target text;
  api_role record;
begin
  foreach target in array array['aiboard_meow_configs', 'aiboard_meow_messages', 'aiboard_meow_timing'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relname = target and c.relrowsecurity) then
      raise exception 'Expected RLS-enabled public.% is missing. No repair committed.', target;
    end if;
    if not exists (select 1 from pg_policies p where p.schemaname = 'public'
                   and p.tablename = target and p.policyname = 'owner_all' and p.cmd = 'ALL'
                   and p.qual is not null and p.with_check is not null) then
      raise exception 'Expected reviewed owner_all policy on public.% is missing. No repair committed.', target;
    end if;
  end loop;
  for api_role in select oid, rolname, rolsuper, rolbypassrls from pg_roles
                  where rolname in ('anon', 'authenticated') loop
    if api_role.rolsuper or api_role.rolbypassrls then
      raise exception 'Role % bypasses RLS; review role configuration first.', api_role.rolname;
    end if;
    if exists (select 1 from pg_roles reader where reader.rolname = 'team_readonly'
               and pg_has_role(api_role.oid, reader.oid, 'USAGE')) then
      raise exception 'Role % inherits team_readonly; review role configuration first.', api_role.rolname;
    end if;
  end loop;
end;
$preflight$;

drop policy if exists public_read_meow_configs on public.aiboard_meow_configs;
drop policy if exists public_read_meow_msgs on public.aiboard_meow_messages;
drop policy if exists public_read_meow_timing on public.aiboard_meow_timing;

revoke all privileges on table
  public.aiboard_meow_configs, public.aiboard_meow_messages, public.aiboard_meow_timing
  from public, anon;

revoke truncate, references, trigger on table
  public.aiboard_meow_configs, public.aiboard_meow_messages, public.aiboard_meow_timing
  from authenticated;

grant select, insert, update, delete on table
  public.aiboard_meow_configs, public.aiboard_meow_messages, public.aiboard_meow_timing
  to authenticated;

-- Check effective privileges, including PUBLIC and inherited role grants.
-- Any remaining excessive privilege raises an error and prevents COMMIT.
do $verify$
declare
  target text;
  operation text;
begin
  foreach target in array array['aiboard_meow_configs', 'aiboard_meow_messages', 'aiboard_meow_timing'] loop
    foreach operation in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('anon', 'public.' || target, operation) then
        raise exception 'anon still has % on %. Check inherited grants; no repair committed.', operation, target;
      end if;
    end loop;
    foreach operation in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      if not has_table_privilege('authenticated', 'public.' || target, operation) then
        raise exception 'authenticated is missing % on %. No repair committed.', operation, target;
      end if;
    end loop;
    foreach operation in array array['TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('authenticated', 'public.' || target, operation) then
        raise exception 'authenticated still has % on %. Check inherited grants; no repair committed.', operation, target;
      end if;
    end loop;
  end loop;
end;
$verify$;

commit;

-- Successful result: three rows, all checks below true.
select t.table_name,
       c.relrowsecurity as rls_enabled,
       not has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as anon_table_access_removed,
       (has_table_privilege('authenticated', c.oid, 'SELECT')
        and has_table_privilege('authenticated', c.oid, 'INSERT')
        and has_table_privilege('authenticated', c.oid, 'UPDATE')
        and has_table_privilege('authenticated', c.oid, 'DELETE')) as authenticated_crud_kept,
       not has_table_privilege('authenticated', c.oid, 'TRUNCATE,REFERENCES,TRIGGER') as excessive_privileges_removed,
       not exists (select 1 from pg_policies p where p.schemaname = 'public'
         and p.tablename = t.table_name and p.policyname in
           ('public_read_meow_configs', 'public_read_meow_msgs', 'public_read_meow_timing')) as public_read_policies_removed
from (values ('aiboard_meow_configs'), ('aiboard_meow_messages'), ('aiboard_meow_timing')) t(table_name)
join pg_namespace n on n.nspname = 'public'
join pg_class c on c.relnamespace = n.oid and c.relname = t.table_name
order by t.table_name;
