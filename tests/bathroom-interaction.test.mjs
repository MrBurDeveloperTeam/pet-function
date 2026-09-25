import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const roomSource = readFileSync(
  new URL('../src/pet/internal/PetRoom.tsx', import.meta.url),
  'utf8',
);
const menusSource = readFileSync(
  new URL('../src/pet/internal/components/RoomMenus.tsx', import.meta.url),
  'utf8',
);

test('bath tools stay hidden until the bathtub is clicked or activated with Space', () => {
  assert.match(roomSource, /aria-label="Interact with the bathtub"/);
  assert.match(roomSource, /const isNearBathtub =/);
  assert.match(roomSource, /event\.code !== 'Space'/);
  assert.match(roomSource, /showBathroomMenu && currentRoom === RoomType\.BATHROOM/);
  assert.doesNotMatch(roomSource, /currentRoom === RoomType\.BATHROOM\) \{\s*setShowBathroomMenu\(true\)/);
});

test('bath tools render in a closable pixel dialog', () => {
  assert.match(menusSource, /aria-label="Bath tools"/);
  assert.match(menusSource, /onClose: \(\) => void/);
  assert.match(menusSource, /border-\[5px\] border-\[#4b2b20\]/);
  assert.match(menusSource, /aria-label="Close bath tools"/);
});
