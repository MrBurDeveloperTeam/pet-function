import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOP_DIALOGUE_POOLS, createShopDialoguePicker } from '../src/pet/internal/shopDialogue.mjs';

test('each shopping occasion draws from its own authored phrases without consecutive repeats', () => {
  let seed = 7;
  const pick = createShopDialoguePicker(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  });
  for (const [kind, lines] of Object.entries(SHOP_DIALOGUE_POOLS)) {
    let previous;
    const seen = new Set();
    for (let i = 0; i < 80; i++) {
      const text = pick(kind);
      assert.ok(lines.includes(text));
      assert.notEqual(text, previous);
      seen.add(text);
      previous = text;
    }
    assert.deepEqual(seen, new Set(lines));
  }
});

test('a different occasion does not reset the previous phrase and unknown events are rejected', () => {
  const pick = createShopDialoguePicker(() => 0);
  const welcome = pick('welcome');
  pick('purchase');
  assert.notEqual(pick('welcome'), welcome);
  for (const kind of ['toString', '__proto__', 'unknown']) assert.throws(() => pick(kind), /Unknown shop dialogue/);
});

test('random boundary and non-finite inputs always return one valid phrase', () => {
  for (const value of [0, 1, -1, Infinity, NaN]) {
    const pick = createShopDialoguePicker(() => value);
    for (const [kind, lines] of Object.entries(SHOP_DIALOGUE_POOLS)) assert.ok(lines.includes(pick(kind)));
  }
});
