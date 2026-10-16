import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  CABINET_ITEMS,
  CABINET_BY_ID,
  emptyCabinets,
  validateCabinets,
  selectCabinet,
} from '../src/pet/internal/cabinets.mjs';
import { createCabinetCloud } from '../src/apps/repositories/cabinetCloud.mjs';

const [games, bathroom, bedroom, kitchen] = ['GAMES', 'BATHROOM', 'BEDROOM', 'KITCHEN']
  .map(room => CABINET_ITEMS.find(item => item.room === room));
const allOwned = () => ({ owned: CABINET_ITEMS.map(item => item.id), selected: {} });

test('each requested room has one unique purchasable cabinet skin and a matching SQL price', () => {
  assert.equal(CABINET_ITEMS.length, 4);
  assert.deepEqual(new Set(CABINET_ITEMS.map(item => item.room)), new Set(['GAMES', 'BATHROOM', 'BEDROOM', 'KITCHEN']));
  assert.equal(new Set(CABINET_ITEMS.map(item => item.id)).size, 4);
  const sql = readFileSync(new URL('../database/pet_cabinets.sql', import.meta.url), 'utf8');
  for (const item of CABINET_ITEMS) {
    assert.equal(CABINET_BY_ID[item.id], item);
    assert.ok(Number.isSafeInteger(item.price) && item.price > 0);
    const escapedId = item.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(sql, new RegExp(`\\('${escapedId}'\\s*,\\s*'${item.room}'\\s*,\\s*${item.price}\\)`));
  }
});

test('room skins persist independently and restoring an original keeps purchases and other rooms', () => {
  const original = allOwned();
  let next = original;
  for (const item of [games, bathroom, bedroom, kitchen]) next = selectCabinet(next, item.room, item.id);
  assert.deepEqual(original.selected, {}, 'selecting must not mutate the previous save');
  const restored = validateCabinets(JSON.parse(JSON.stringify(next)));
  assert.equal(Object.keys(restored.selected).length, 4);
  next = selectCabinet(restored, bedroom.room, null);
  assert.equal(next.selected.BEDROOM, undefined);
  for (const item of [games, bathroom, kitchen]) assert.equal(next.selected[item.room], item.id);
  assert.deepEqual(next.owned, original.owned, 'using the original must not revoke ownership');
  assert.equal(restored.selected.BEDROOM, bedroom.id, 'removing must not mutate the saved snapshot');
  assert.notEqual(next.owned, restored.owned);
  assert.notEqual(next.selected, restored.selected);
});

test('buying a skin alone does not select it, and empty saves are independent values', () => {
  const first = emptyCabinets();
  const second = emptyCabinets();
  first.owned.push(games.id);
  assert.deepEqual(second, { owned: [], selected: {} });
  assert.deepEqual(validateCabinets(first).selected, {});
});

test('unowned skins, another room skin and unsupported rooms cannot be selected', () => {
  assert.throws(() => selectCabinet(emptyCabinets(), games.room, games.id));
  assert.throws(() => selectCabinet(allOwned(), games.room, bedroom.id));
  assert.throws(() => selectCabinet(allOwned(), 'LIVING_ROOM', null));
  assert.throws(() => selectCabinet(allOwned(), 'constructor', null));
  assert.throws(() => selectCabinet(allOwned(), games.room, 'unknown'));
  assert.deepEqual(selectCabinet(emptyCabinets(), games.room, null), emptyCabinets());
});

test('malformed ownership or selection is rejected before it can become saved state', () => {
  for (const invalid of [
    null,
    {},
    Object.assign([], { owned: [], selected: {} }),
    { owned: [], selected: [] },
    { owned: [], selected: new Date() },
    { owned: new Array(1), selected: {} },
    { owned: [games.id, games.id], selected: {} },
    { owned: ['constructor'], selected: {} },
    { owned: [null], selected: {} },
    { owned: [[games.id]], selected: {} },
    { owned: [new String(games.id)], selected: {} },
    { owned: [], selected: { GAMES: games.id } },
    { owned: [games.id], selected: { BEDROOM: games.id } },
    { owned: [games.id], selected: { GAMES: null } },
  ]) assert.throws(() => validateCabinets(invalid), `accepted malformed save ${JSON.stringify(invalid)}`);
});

test('cloud calls send only catalog and room choices, then accept confirmed server state', async () => {
  const calls = [];
  const purchased = { owned: [games.id], selected: {} };
  const selected = selectCabinet(purchased, games.room, games.id);
  const api = createCabinetCloud({
    rpc: async (name, args) => {
      calls.push({ name, args });
      const data = name === 'pet_cabinets_purchase'
        ? { cabinets: purchased, coins: 7800 }
        : name === 'pet_cabinets_select' && args.p_item_id !== null ? selected : purchased;
      return { data, error: null };
    },
  });
  assert.deepEqual(await api.loadCabinets('alice'), purchased);
  assert.deepEqual(await api.purchaseCabinetItem('alice', games.id), { cabinets: purchased, coins: 7800 });
  assert.deepEqual(await api.selectCabinetItem('alice', games.room, games.id), selected);
  assert.deepEqual(await api.selectCabinetItem('alice', games.room, null), purchased);
  assert.deepEqual(calls, [
    { name: 'pet_cabinets_get', args: undefined },
    { name: 'pet_cabinets_purchase', args: { p_item_id: games.id } },
    { name: 'pet_cabinets_select', args: { p_room: games.room, p_item_id: games.id } },
    { name: 'pet_cabinets_select', args: { p_room: games.room, p_item_id: null } },
  ]);
});

test('unsigned and invalid requests never reach the cloud', async () => {
  let calls = 0;
  const api = createCabinetCloud({ rpc: async () => { calls++; return { data: emptyCabinets(), error: null }; } });
  await assert.rejects(() => api.loadCabinets(''), /Sign in/);
  await assert.rejects(() => api.purchaseCabinetItem('', games.id), /Sign in/);
  await assert.rejects(() => api.selectCabinetItem('', games.room, null), /Sign in/);
  await assert.rejects(() => api.purchaseCabinetItem('alice', 'constructor'), /Unknown/);
  await assert.rejects(() => api.selectCabinetItem('alice', 'LIVING_ROOM', null), /Invalid/);
  await assert.rejects(() => api.selectCabinetItem('alice', games.room, bedroom.id), /Invalid/);
  assert.equal(calls, 0);
});

test('cloud failures and invalid purchase receipts cannot grant a successful purchase', async () => {
  const failure = new Error('Offline');
  const api = createCabinetCloud({ rpc: async () => ({ data: null, error: failure }) });
  for (const invoke of [
    () => api.loadCabinets('alice'),
    () => api.purchaseCabinetItem('alice', games.id),
    () => api.selectCabinetItem('alice', games.room, null),
  ]) await assert.rejects(invoke, error => error === failure);
  for (const receipt of [
    null,
    { cabinets: emptyCabinets(), coins: 2000 },
    { cabinets: { owned: [games.id], selected: {} }, coins: -1 },
    { cabinets: { owned: [games.id], selected: {} }, coins: 1.5 },
    { cabinets: { owned: [games.id], selected: {} }, coins: '2000' },
    { cabinets: { owned: [games.id], selected: {} }, coins: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    const bad = createCabinetCloud({ rpc: async () => ({ data: receipt, error: null }) });
    await assert.rejects(() => bad.purchaseCabinetItem('alice', games.id));
  }
});

test('selection requires the exact requested server receipt for both use and restore', async () => {
  const purchased = { owned: [games.id], selected: {} };
  const stillOriginal = createCabinetCloud({ rpc: async () => ({ data: purchased, error: null }) });
  await assert.rejects(() => stillOriginal.selectCabinetItem('alice', games.room, games.id), /not saved/);
  const selected = selectCabinet(purchased, games.room, games.id);
  const stillSelected = createCabinetCloud({ rpc: async () => ({ data: selected, error: null }) });
  await assert.rejects(() => stillSelected.selectCabinetItem('alice', games.room, null), /not saved/);
});
