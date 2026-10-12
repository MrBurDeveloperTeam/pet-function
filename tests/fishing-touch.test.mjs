import test from 'node:test';
import assert from 'node:assert/strict';
import { fishingTapAction } from '../src/pet/internal/fishingTouch.mjs';

const start = { id: 7, x: 200, y: 180, time: 100, phase: 'ready' };
const end = { id: 7, x: 202, y: 182, time: 200 };
const state = { phase: 'ready', paused: false, tutorial: false };

test('touch taps match the Space action in every fishing phase', () => {
  for (const [phase, action] of Object.entries({ ready: 'cast', power: 'power', reeling: 'reel', result: 'again', waiting: null })) {
    assert.equal(fishingTapAction({ ...start, phase }, end, { ...state, phase }), action);
  }
});
test('pause, tutorial, swipes and unintended pointers cannot trigger fishing', () => {
  assert.equal(fishingTapAction(start, end, { ...state, paused: true }), null);
  assert.equal(fishingTapAction(start, end, { ...state, tutorial: true }), null);
  assert.equal(fishingTapAction(start, { ...end, x: 300 }, state), null);
  assert.equal(fishingTapAction(start, { ...end, time: 900 }, state), null);
  assert.equal(fishingTapAction(start, { ...end, id: 8 }, state), null);
  assert.equal(fishingTapAction(null, end, state), null);
  assert.equal(fishingTapAction({ ...start, phase: 'waiting' }, end, { ...state, phase: 'power' }), null, 'A bite during a held touch cannot accidentally select power');
});
