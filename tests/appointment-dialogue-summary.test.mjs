import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await build({
  entryPoints: [resolve(root, 'src/apps/appointment/petDialogue/buildAppointmentDialoguePool.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { buildAppointmentDialoguePool } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64')
);

const now = new Date(2026, 8, 22, 10, 0, 0);
const date = '2026-09-22';
const range = { start: '2026-09-01T00:00:00.000Z', end: '2026-09-30T23:59:59.999Z' };
const rooms = [{ id: 'r1', name: 'Room 1' }, { id: 'r2', name: 'Room 2' }];
const appointment = (id, overrides = {}) => ({
  id, date, startTime: '09:30', endTime: '10:45', status: 'confirmed', roomId: 'r1', ...overrides,
});

test('daily summary includes count, occupied room, and reliable release time', () => {
  const rows = [appointment('a1'), appointment('a2', { startTime: '14:00', endTime: '15:00', roomId: 'r2' })];
  const pool = buildAppointmentDialoguePool(rows, rows, rooms, range, now);
  const summary = pool.find(({ triggerId }) => triggerId === 'appointment_daily_summary');
  assert.ok(summary);
  assert.match(summary.message, /^You have 2 appointments today\. Room 1 is currently in use until .+\.$/);
  assert.equal(summary.facts.appointmentCount, 2);
  assert.equal(summary.facts.occupiedRoomCount, 1);
  assert.equal(summary.facts.occupiedRoomName, 'Room 1');
  assert.equal(summary.facts.occupiedRoomUntil, new Date(2026, 8, 22, 10, 45).toISOString());
  assert.equal(summary.evaluatedAt, now.toISOString());
});

test('daily summary dedupe changes when appointment load or room occupancy changes', () => {
  const one = [appointment('a1')];
  const first = buildAppointmentDialoguePool(one, one, rooms, range, now)
    .find(({ triggerId }) => triggerId === 'appointment_daily_summary');
  const later = new Date(2026, 8, 22, 11, 0, 0);
  const second = buildAppointmentDialoguePool(one, one, rooms, range, later)
    .find(({ triggerId }) => triggerId === 'appointment_daily_summary');
  const two = [appointment('a1'), appointment('a2', { startTime: '14:00', endTime: '15:00', roomId: 'r2' })];
  const third = buildAppointmentDialoguePool(two, two, rooms, range, later)
    .find(({ triggerId }) => triggerId === 'appointment_daily_summary');
  assert.notEqual(first.dedupeKey, second.dedupeKey);
  assert.notEqual(second.dedupeKey, third.dedupeKey);
});

test('cancelled appointments never count and uncovered dates never claim zero', () => {
  const cancelled = [appointment('a1', { status: 'cancelled' })];
  const pool = buildAppointmentDialoguePool(cancelled, cancelled, rooms, range, now);
  assert.equal(pool[0].triggerId, 'appointment_none_today');
  const uncovered = { start: '2026-10-01T00:00:00.000Z', end: '2026-10-31T23:59:59.999Z' };
  assert.deepEqual(buildAppointmentDialoguePool([], [], rooms, uncovered, now), []);
});
