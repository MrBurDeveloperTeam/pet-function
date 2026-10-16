import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NPC_DIALOGUE_POOLS, createNpcDialoguePicker, findNearbyNpc } from '../src/pet/internal/npcDialogue.mjs';

const allLines = Object.values(NPC_DIALOGUE_POOLS).flat();
const seededRandom = seed => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

test('all eight dialogue moods contain 20 unique short lines', () => {
  assert.deepEqual(Object.keys(NPC_DIALOGUE_POOLS), ['happy', 'calm', 'excited', 'sad', 'grumpy', 'sleepy', 'hungry', 'curious']);
  assert.equal(allLines.length, 160);
  assert.equal(new Set(allLines).size, 160);
  for (const lines of Object.values(NPC_DIALOGUE_POOLS)) {
    assert.equal(lines.length, 20);
    assert.ok(lines.every(line => typeof line === 'string' && line.trim() === line && line.length > 20 && line.length < 160));
    assert.ok(Object.isFrozen(lines));
  }
});

test('a shuffled NPC deck covers every line once before refilling', () => {
  const pick = createNpcDialoguePicker(seededRandom(42));
  const first = Array.from({ length: 160 }, () => pick('pond-cat'));
  assert.deepEqual(new Set(first.map(line => line.text)), new Set(allLines));
  for (const line of first) assert.ok(NPC_DIALOGUE_POOLS[line.mood].includes(line.text));
  assert.notDeepEqual(first.map(line => line.text), allLines);
  const second = Array.from({ length: 160 }, () => pick('pond-cat'));
  assert.deepEqual(new Set(second.map(line => line.text)), new Set(allLines));
  assert.notEqual(first.at(-1).text, second[0].text);
});

test('NPCs keep independent deck progress and random order', () => {
  const pick = createNpcDialoguePicker(seededRandom(7));
  const firstCat = [pick('football-cat')];
  const secondCat = Array.from({ length: 160 }, () => pick('racing-cat'));
  firstCat.push(...Array.from({ length: 159 }, () => pick('football-cat')));
  assert.equal(new Set(firstCat.map(line => line.text)).size, 160);
  assert.equal(new Set(secondCat.map(line => line.text)).size, 160);
  assert.notDeepEqual(firstCat, secondCat);
});

test('deck boundary avoids the previous line when a new shuffle puts it next', () => {
  let randomCalls = 0;
  const pick = createNpcDialoguePicker(() => ++randomCalls === 160 ? 0 : 1);
  const lines = Array.from({ length: 481 }, () => pick('bench-cat').text);
  assert.equal(lines[159], allLines[0]);
  assert.notEqual(lines[160], allLines[0]);
  for (let i = 1; i < lines.length; i++) assert.notEqual(lines[i], lines[i - 1]);
  const invalidRandom = createNpcDialoguePicker(() => NaN);
  assert.ok(allLines.includes(invalidRandom('other-cat').text));
});

test('nearby NPC chooses the closest eligible center including the distance boundary', () => {
  const positions = { far: { x: 40, y: 0 }, boundary: { x: 3, y: 4 }, near: { x: 2, y: 0 } };
  assert.equal(findNearbyNpc(positions, { x: 0, y: 0 }, 5), 'near');
  assert.equal(findNearbyNpc({ boundary: positions.boundary }, { x: 0, y: 0 }, 5), 'boundary');
  assert.equal(findNearbyNpc(positions, { x: 0, y: 0 }, 1), null);
  assert.equal(findNearbyNpc({ exact: { x: 4, y: 8 } }, { x: 4, y: 8 }, 0), 'exact');
  assert.equal(findNearbyNpc({ first: { x: -2, y: 0 }, second: { x: 2, y: 0 } }, { x: 0, y: 0 }, 5), 'first');
});

test('nearby NPC ignores invalid positions and rejects invalid player/range values', () => {
  const positions = { invalid: { x: NaN, y: 0 }, missing: {}, empty: null, valid: { x: 3, y: 0 } };
  assert.equal(findNearbyNpc(positions, { x: 0, y: 0 }, 5), 'valid');
  for (const range of [-1, NaN, Infinity, undefined]) {
    assert.equal(findNearbyNpc(positions, { x: 0, y: 0 }, range), null);
  }
  for (const player of [null, {}, { x: Infinity, y: 0 }, { x: 0, y: '0' }]) {
    assert.equal(findNearbyNpc(positions, player, 5), null);
  }
  assert.equal(findNearbyNpc({}, { x: 0, y: 0 }, 5), null);
  assert.equal(findNearbyNpc(null, { x: 0, y: 0 }, 5), null);
});

test('the four game-entrance NPCs retain their existing fixed invitations', () => {
  const source = readFileSync(new URL('../src/pet/internal/sceneCats.ts', import.meta.url), 'utf8');
  const invitations = [...source.matchAll(/id: '([^']+)'[^\n]+dialogue: '([^']+)'/g)]
    .map(([, id, text]) => [id, text]);
  assert.deepEqual(invitations, [
    ['kart-spectator', 'Bet you can beat my lap! 🏁'],
    ['home-pond-bank', 'Ooh, something shiny in the pond! ✨'],
    ['stadium-midfield', 'One little kick? I dare you! ⚽'],
    ['stadium-corner', 'Think you can jump past me? ✨'],
  ]);
});
