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
const outlinesSource = readFileSync(
  new URL('../src/pet/internal/components/RoomInteractionOutlines.tsx', import.meta.url),
  'utf8',
);

test('food stays hidden until the refrigerator is clicked or activated with Space', () => {
  assert.match(outlinesSource, /label: 'Open food inventory'/);
  assert.match(outlinesSource, /aria-label=\{label\}/);
  assert.match(roomSource, /const isNearFridge =/);
  assert.match(roomSource, /event\.code !== 'Space'/);
  assert.match(roomSource, /showFoodMenu && currentRoom === RoomType\.KITCHEN/);
  assert.doesNotMatch(roomSource, /currentRoom === RoomType\.KITCHEN\) \{\s*setShowFoodMenu\(true\)/);
});

test('food inventory renders as a clear top-side pixel panel beside the map', () => {
  assert.match(menusSource, /aria-label="Food inventory"/);
  assert.match(menusSource, /onClose: \(\) => void/);
  assert.match(menusSource, /border-\[5px\] border-\[#4b2b20\]/);
  assert.match(menusSource, /aria-label="Close food inventory"/);
  assert.match(menusSource, /xl:left-\[11\.5rem\] xl:top-6/);
  assert.doesNotMatch(menusSource, /fixed inset-0 z-\[45\]/);
});

test('an open food inventory closes with Space or Escape', () => {
  assert.match(roomSource, /event\.key !== 'Escape' && event\.code !== 'Space'/);
  assert.match(roomSource, /setShowFoodMenu\(false\)/);
});
