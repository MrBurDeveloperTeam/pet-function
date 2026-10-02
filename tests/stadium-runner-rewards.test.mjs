import assert from 'node:assert/strict';
import test from 'node:test';
import { runnerRewards } from '../src/pet/internal/runnerRewards.ts';

test('teeth convert at 10:1 with whole wallet coins', () => {
  assert.deepEqual(runnerRewards(100, 0), { coins: 10, xp: 0 });
  assert.deepEqual(runnerRewards(109, 0), { coins: 10, xp: 0 });
  assert.deepEqual(runnerRewards(9, 0), { coins: 0, xp: 0 });
});
test('XP counts complete active minutes only', () => {
  assert.equal(runnerRewards(0, 59.999).xp, 0);
  assert.equal(runnerRewards(0, 60).xp, 2);
  assert.equal(runnerRewards(0, 120).xp, 4);
  assert.equal(runnerRewards(0, 3600).xp, 120);
});
test('reject invalid rewards instead of poisoning the pet wallet', () => {
  for (const teeth of [-1, 1.5, Infinity, NaN, '100', null]) assert.equal(runnerRewards(teeth, 60), null);
  for (const time of [-1, Infinity, NaN, '60', null]) assert.equal(runnerRewards(100, time), null);
});
