// Isolated PostgreSQL/WASM test. Never connects to Supabase or any remote DB.
// Pass the path to an installed @electric-sql/pglite module as argv[2].
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { WARDROBE_ITEMS } from '../src/pet/internal/wardrobe.mjs';
const { PGlite } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : '@electric-sql/pglite');
const db = new PGlite();
const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';
await db.exec(`create role authenticated; create role anon; create role service_role;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
 grant usage on schema auth to authenticated,anon;
 create table public.inventory_pet(user_id uuid primary key,pet_name text,coins integer not null);
 insert into auth.users values('${alice}'),('${bob}');
 insert into public.inventory_pet values('${alice}','mallow',10000),('${bob}','gulu',100);`);
const sql = readFileSync(new URL('../database/pet_wardrobe.sql', import.meta.url), 'utf8');
await db.exec(sql); await db.exec(sql);
for (const item of WARDROBE_ITEMS) {
  const row = (await db.query('select slot,price from public.pet_wardrobe_catalog where item_id=$1', [item.id])).rows[0];
  assert.deepEqual(row, { slot: item.slot, price: item.price });
}
const login = async uid => db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid}',false); set role authenticated;`);
const get = async () => (await db.query('select public.pet_wardrobe_get() as state')).rows[0].state;
await login(alice); assert.deepEqual(await get(), { owned: [], outfits: {} });
const buy = async id => (await db.query('select public.pet_wardrobe_purchase($1) as receipt', [id])).rows[0].receipt;
const first = await buy('rose_knit'); assert.equal(first.coins, 8200);
assert.equal((await buy('rose_knit')).coins, 8200, 'duplicate purchase must not charge twice');
await assert.rejects(() => db.query("insert into public.pet_wardrobe_owned(user_id,item_id) values($1,'sky_sailor')", [alice]), /permission denied/);
await assert.rejects(() => db.query("select public.pet_wardrobe_equip('mallow','neck','rose_knit')"), /Buy this item/);
await assert.rejects(() => db.query("select public.pet_wardrobe_equip('mallow','body','sky_sailor')"), /Buy this item/);
for (const pet of ['mallow','silverbelt','fastrat','gulu','munchkin','mochi']) {
  await db.query("select public.pet_wardrobe_equip($1,'body','rose_knit')", [pet]);
}
assert.equal(Object.keys((await get()).outfits).length, 6);
await db.query("select public.pet_wardrobe_equip('gulu','body',null)");
assert.equal((await get()).outfits.gulu, undefined);
await login(bob); assert.deepEqual(await get(), { owned: [], outfits: {} });
assert.equal((await db.query('select * from public.pet_wardrobe_owned')).rows.length, 0, 'RLS hides another owner');
await assert.rejects(() => buy('rose_knit'), /Insufficient coins/);
await assert.rejects(() => db.query("select public.pet_wardrobe_equip('mallow','body','rose_knit')"), /Buy this item/);
await login(alice); assert.equal((await get()).outfits.mallow.body, 'rose_knit', 'fresh session restores outfit');
await db.exec('reset role; set role anon;');
await assert.rejects(get, /permission denied/);
await login(''); await assert.rejects(get, /Authentication required/);
await db.exec('reset role;');
assert.equal((await db.query('select coins from public.inventory_pet where user_id=$1', [bob])).rows[0].coins, 100);
assert.equal((await db.query('select coins from public.inventory_pet where user_id=$1', [alice])).rows[0].coins, 8200);
await db.close();
console.log('PASS: SQL installs twice; prices, atomic/idempotent purchase, insufficient funds, slot validation, six-cat outfits, removal, session reload, RLS and anonymous rejection. No remote database accessed.');
