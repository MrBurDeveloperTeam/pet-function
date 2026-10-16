// Isolated PostgreSQL/WASM verification. No network or Supabase access.
// Pass an installed @electric-sql/pglite module path as argv[2].
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : '@electric-sql/pglite');
const repair = readFileSync(new URL('../database/aiboard_meow_presets_private.sql', import.meta.url), 'utf8');
const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';
const aliceConfig = '10000000-0000-4000-8000-000000000001';
const bobConfig = '10000000-0000-4000-8000-000000000002';
const tables = ['aiboard_meow_configs', 'aiboard_meow_messages', 'aiboard_meow_timing'];
const publicPolicies = ['public_read_meow_configs', 'public_read_meow_msgs', 'public_read_meow_timing'];
let checks = 0;
const same = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const rejects = async (fn, matcher, message) => { await assert.rejects(fn, matcher, message); checks += 1; };

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create role team_readonly;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema public, auth to anon, authenticated, service_role, team_readonly;
    create table public.aiboard_meow_configs (
      id uuid primary key default gen_random_uuid(),
      user_id uuid unique,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create table public.aiboard_meow_messages (
      id uuid primary key default gen_random_uuid(),
      config_id uuid not null references public.aiboard_meow_configs(id) on delete cascade,
      state text not null,
      message text not null,
      is_audio boolean not null default false,
      audio_name text,
      sort_order integer not null default 0,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create table public.aiboard_meow_timing (
      id uuid primary key default gen_random_uuid(),
      config_id uuid not null references public.aiboard_meow_configs(id) on delete cascade,
      state text not null,
      message_duration_minutes numeric not null,
      message_interval_minutes numeric not null,
      disabled boolean not null default false,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    alter table public.aiboard_meow_configs enable row level security;
    alter table public.aiboard_meow_messages enable row level security;
    alter table public.aiboard_meow_timing enable row level security;
    create policy owner_all on public.aiboard_meow_configs for all to public
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
    create policy owner_all on public.aiboard_meow_messages for all to public
      using (exists (select 1 from public.aiboard_meow_configs c where c.id = config_id and c.user_id = auth.uid()))
      with check (exists (select 1 from public.aiboard_meow_configs c where c.id = config_id and c.user_id = auth.uid()));
    create policy owner_all on public.aiboard_meow_timing for all to public
      using (exists (select 1 from public.aiboard_meow_configs c where c.id = config_id and c.user_id = auth.uid()))
      with check (exists (select 1 from public.aiboard_meow_configs c where c.id = config_id and c.user_id = auth.uid()));
    create policy public_read_meow_configs on public.aiboard_meow_configs for select to public using (true);
    create policy public_read_meow_msgs on public.aiboard_meow_messages for select to public using (true);
    create policy public_read_meow_timing on public.aiboard_meow_timing for select to public using (true);
    create policy team_readonly_select_all on public.aiboard_meow_configs for select to team_readonly using (true);
    create policy team_readonly_select_all on public.aiboard_meow_messages for select to team_readonly using (true);
    create policy team_readonly_select_all on public.aiboard_meow_timing for select to team_readonly using (true);
    grant all privileges on public.aiboard_meow_configs, public.aiboard_meow_messages, public.aiboard_meow_timing to anon, authenticated, service_role;
    grant select on public.aiboard_meow_configs, public.aiboard_meow_messages, public.aiboard_meow_timing to team_readonly;
    insert into auth.users values ('${alice}'), ('${bob}');
    insert into public.aiboard_meow_configs(id, user_id) values ('${aliceConfig}', '${alice}'), ('${bobConfig}', '${bob}');
    insert into public.aiboard_meow_messages(config_id, state, message) values ('${aliceConfig}', 'Normal', 'Alice private line'), ('${bobConfig}', 'Normal', 'Bob private line');
    insert into public.aiboard_meow_timing(config_id, state, message_duration_minutes, message_interval_minutes)
      values ('${aliceConfig}', 'Normal', 0.1, 0.25), ('${bobConfig}', 'Normal', 0.1, 0.25);
  `);
  return db;
}

async function asRole(db, role, userId = '') {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${userId}', false); set role ${role};`);
}

async function rowCount(db, table) {
  return Number((await db.query(`select count(*) as count from public.${table}`)).rows[0].count);
}

async function policyNames(db) {
  return (await db.query(`select tablename, policyname from pg_policies where schemaname = 'public' and tablename in ('${tables.join("','")}') order by tablename, policyname`)).rows;
}

const db = await fixture();
try {
  await asRole(db, 'anon');
  for (const table of tables) same(await rowCount(db, table), 2, `fixture reproduces anonymous public read for ${table}`);
  await asRole(db, 'postgres');
  const ownerPolicies = (await policyNames(db)).filter(row => !publicPolicies.includes(row.policyname));
  for (let run = 0; run < 2; run += 1) {
    const results = await db.exec(repair);
    const summary = results.at(-1).rows;
    same(summary.length, 3, `repair run ${run + 1} reports all three tables`);
    for (const row of summary) {
      const { table_name: tableName, ...flags } = row;
      same(flags, {
        rls_enabled: true,
        anon_table_access_removed: true,
        authenticated_crud_kept: true,
        excessive_privileges_removed: true,
        public_read_policies_removed: true,
      }, `${tableName} repair verification flags are all true`);
    }
  }
  same(await policyNames(db), ownerPolicies, 'only the three public-read policies are removed; owner/team policies survive twice');

  await asRole(db, 'authenticated', alice);
  for (const table of tables) same(await rowCount(db, table), 1, `Alice can read only her ${table}`);
  same((await db.query(`update public.aiboard_meow_configs set user_id = user_id where id = '${aliceConfig}' returning id`)).rows.length, 1, 'own config update works');
  same((await db.query(`delete from public.aiboard_meow_configs where id = '${aliceConfig}' returning id`)).rows.length, 1, 'own config delete works');
  same(await rowCount(db, 'aiboard_meow_messages'), 0, 'owned config cascades only its messages');
  same(await rowCount(db, 'aiboard_meow_timing'), 0, 'owned config cascades only its timing');
  same((await db.query(`insert into public.aiboard_meow_configs(id,user_id) values ('${aliceConfig}','${alice}') returning id`)).rows.length, 1, 'own config insert works');
  const messageId = (await db.query(`insert into public.aiboard_meow_messages(config_id,state,message) values ('${aliceConfig}','Hungry','Alice new line') returning id`)).rows[0].id;
  const timingId = (await db.query(`insert into public.aiboard_meow_timing(config_id,state,message_duration_minutes,message_interval_minutes) values ('${aliceConfig}','Hungry',0.1,0.25) returning id`)).rows[0].id;
  checks += 2;
  same((await db.query('update public.aiboard_meow_messages set message=$1 where id=$2 returning id', ['Alice edited line', messageId])).rows.length, 1, 'own text update works');
  same((await db.query('update public.aiboard_meow_timing set message_interval_minutes=0.5 where id=$1 returning id', [timingId])).rows.length, 1, 'own timing update works');

  for (const table of tables) {
    const predicate = table === 'aiboard_meow_configs' ? `id = '${bobConfig}'` : `config_id = '${bobConfig}'`;
    const column = table === 'aiboard_meow_configs' ? 'user_id' : 'state';
    same((await db.query(`select * from public.${table} where ${predicate}`)).rows.length, 0, `cross-account ${table} read is hidden`);
    same((await db.query(`update public.${table} set ${column}=${column} where ${predicate} returning id`)).rows.length, 0, `cross-account ${table} update affects zero rows`);
    same((await db.query(`delete from public.${table} where ${predicate} returning id`)).rows.length, 0, `cross-account ${table} delete affects zero rows`);
  }
  await rejects(() => db.query(`insert into public.aiboard_meow_configs(user_id) values ('${bob}')`), /row-level security/i, 'another owner config insert is rejected');
  await rejects(() => db.query(`update public.aiboard_meow_configs set user_id = '${bob}' where id = '${aliceConfig}'`), /row-level security/i, 'config owner reassignment is rejected');
  for (const table of ['aiboard_meow_messages', 'aiboard_meow_timing']) {
    const columns = table === 'aiboard_meow_messages' ? 'config_id,state,message' : 'config_id,state,message_duration_minutes,message_interval_minutes';
    const values = table === 'aiboard_meow_messages' ? `'${bobConfig}','Normal','Illegal line'` : `'${bobConfig}','Normal',0.1,0.25`;
    await rejects(() => db.query(`insert into public.${table}(${columns}) values (${values})`), /row-level security/i, `cross-account ${table} insert rejected`);
    await rejects(() => db.query(`update public.${table} set config_id='${bobConfig}' where config_id='${aliceConfig}'`), /row-level security/i, `cross-account ${table} reparent rejected`);
  }
  same((await db.query('delete from public.aiboard_meow_messages where id=$1 returning id', [messageId])).rows.length, 1, 'own text delete works');
  same((await db.query('delete from public.aiboard_meow_timing where id=$1 returning id', [timingId])).rows.length, 1, 'own timing delete works');
  await db.query(`insert into public.aiboard_meow_messages(config_id,state,message) values ('${aliceConfig}','Normal','Alice restored line')`);
  await db.query(`insert into public.aiboard_meow_timing(config_id,state,message_duration_minutes,message_interval_minutes) values ('${aliceConfig}','Normal',0.1,0.25)`);

  await asRole(db, 'authenticated', bob);
  for (const table of tables) same(await rowCount(db, table), 1, `Bob's ${table} remains readable and intact`);
  for (const table of tables) await rejects(() => db.query(`truncate table public.${table} cascade`), /permission denied/i, `authenticated truncate on ${table} denied`);
  await asRole(db, 'anon');
  for (const table of tables) {
    for (const statement of [
      `select * from public.${table}`,
      `insert into public.${table} default values`,
      `update public.${table} set id=id`,
      `delete from public.${table}`,
      `truncate table public.${table} cascade`,
    ]) await rejects(() => db.query(statement), /permission denied/i, `anonymous ${statement.split(' ')[0]} denied on ${table}`);
  }
  await asRole(db, 'team_readonly');
  for (const table of tables) {
    same(await rowCount(db, table), 2, `team_readonly still reads all ${table} rows`);
    await rejects(() => db.query(`delete from public.${table}`), /permission denied/i, `team_readonly remains read-only on ${table}`);
  }
  await asRole(db, 'service_role');
  for (const table of tables) same(await rowCount(db, table), 2, `service_role still reads all ${table} rows`);
  await asRole(db, 'postgres');
  for (const table of tables) {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
      same((await db.query('select has_table_privilege($1,$2,$3) as allowed', ['service_role', `public.${table}`, privilege])).rows[0].allowed, true, `service_role ${privilege} preserved`);
    }
  }
} finally { await db.close(); }

// The postcondition must catch inherited privileges and roll the whole repair
// back, including every DROP POLICY and REVOKE executed earlier in the script.
const inherited = await fixture();
try {
  await inherited.exec('create role unsafe_parent; grant unsafe_parent to authenticated; grant truncate on public.aiboard_meow_configs to unsafe_parent;');
  const beforePolicies = await policyNames(inherited);
  await rejects(() => inherited.exec(repair), /inherit|TRUNCATE|privilege|permission/i, 'unexpected inherited truncate prevents the repair from committing');
  await inherited.exec('rollback; reset role;');
  same(await policyNames(inherited), beforePolicies, 'failed repair restores every original policy');
  await asRole(inherited, 'anon');
  for (const table of tables) same(await rowCount(inherited, table), 2, 'rollback restores the original fixture grants and public read policy');
} finally { await inherited.close(); }

// A direct PUBLIC table grant must not keep anonymous table access alive.
const publicGrant = await fixture();
try {
  await publicGrant.exec('grant all privileges on public.aiboard_meow_configs, public.aiboard_meow_messages, public.aiboard_meow_timing to public;');
  await publicGrant.exec(repair);
  await asRole(publicGrant, 'anon');
  for (const table of tables) await rejects(() => publicGrant.query(`select * from public.${table}`), /permission denied/i, 'PUBLIC-derived anonymous table privilege is removed');
  await asRole(publicGrant, 'team_readonly');
  for (const table of tables) same(await rowCount(publicGrant, table), 2, 'direct team_readonly grant survives PUBLIC revocation');
} finally { await publicGrant.close(); }

console.log(`PASS: ${checks} isolated PostgreSQL checks; repair installs twice, owner CRUD and isolation, anonymous rejection, preserved readonly/service access, inherited-privilege rollback and PUBLIC revocation. No remote database accessed.`);
