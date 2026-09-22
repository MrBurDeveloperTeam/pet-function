import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await build({
  entryPoints: [resolve(root, 'src/apps/inventory/petDialogue/buildInventoryDialoguePool.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { buildInventoryDialoguePool } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64')
);

const now = new Date(2026, 8, 22, 12);
const rooms = (items) => [{ id: 'room-1', name: 'Clinic', items }];
const item = (id, qty, expiryDate = null) => ({
  id,
  name: id,
  createdAt: '2026-01-01',
  batches: [{ id: `${id}-batch`, qty, unitPrice: 1, expiryDate }],
});

test('healthy inventory dialogue reports current factual quantity and tracks material changes', () => {
  const first = buildInventoryDialoguePool(rooms([item('gloves', 25), item('masks', 40)]), now);
  assert.equal(first[0].triggerId, 'inventory_summary');
  assert.equal(first[0].message, 'You currently have 65 units across 2 tracked items.');
  assert.deepEqual(first[0].facts, {
    itemCount: 2, totalQuantity: 65, healthyCount: 2,
    expiredCount: 0, outOfStockCount: 0, lowStockCount: 0, expiringSoonCount: 0,
  });
  const changed = buildInventoryDialoguePool(rooms([item('gloves', 26), item('masks', 40)]), now);
  assert.notEqual(changed[0].dedupeKey, first[0].dedupeKey);
});

test('risk alerts retain priority over the factual inventory summary', () => {
  const pool = buildInventoryDialoguePool(rooms([
    item('expired', 5, '2026-09-21'),
    item('out', 0),
    item('low', 3),
    item('soon', 20, '2026-09-23'),
    item('healthy', 50),
  ]), now);
  assert.deepEqual(pool.map(({ triggerId }) => triggerId), [
    'inventory_expired', 'inventory_out_of_stock', 'inventory_low_stock',
    'inventory_expiring_soon', 'inventory_summary',
  ]);
  assert.equal(pool[3].message, 'soon expires in 1 day.');
});

test('empty or anomalous inventory never produces a positive summary', () => {
  assert.deepEqual(buildInventoryDialoguePool(rooms([]), now), []);
  assert.ok(!buildInventoryDialoguePool(rooms([item('bad', -2)]), now).some((candidate) => candidate.triggerId === 'inventory_summary'));
});
