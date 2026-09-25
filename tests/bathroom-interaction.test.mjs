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

test('bath tools stay hidden until the bathtub is clicked or activated with Space', () => {
  assert.match(outlinesSource, /label: 'Use bath tools'/);
  assert.match(outlinesSource, /aria-label=\{label\}/);
  assert.match(roomSource, /const isNearBathtub =/);
  assert.match(roomSource, /event\.code !== 'Space'/);
  assert.match(roomSource, /showBathroomMenu && currentRoom === RoomType\.BATHROOM/);
  assert.doesNotMatch(roomSource, /currentRoom === RoomType\.BATHROOM\) \{\s*setShowBathroomMenu\(true\)/);
});

test('bath tools render as a clear top-side pixel panel beside the map', () => {
  assert.match(menusSource, /aria-label="Bath tools"/);
  assert.match(menusSource, /onClose: \(\) => void/);
  assert.match(menusSource, /border-\[5px\] border-\[#4b2b20\]/);
  assert.match(menusSource, /aria-label="Close bath tools"/);
  assert.match(menusSource, /xl:left-\[11\.5rem\] xl:top-6/);
  assert.doesNotMatch(menusSource, /fixed inset-0 z-\[45\]/);
});

test('open bath tools close with Space or Escape', () => {
  assert.match(roomSource, /event\.key !== 'Escape' && event\.code !== 'Space'/);
  assert.match(roomSource, /setShowBathroomMenu\(false\)/);
});

test('five soap rubs unlock the shower and four completed cycles fill Clean', () => {
  assert.match(roomSource, /const SOAP_RUBS_TO_LATHER = 5/);
  assert.match(roomSource, /const SOAP_RUB_INTERVAL_MS = 220/);
  assert.match(roomSource, /const CLEAN_GAIN_PER_BATH_CYCLE = 25/);
  assert.match(roomSource, /const MAX_BUBBLES = SOAP_RUBS_TO_LATHER/);
  assert.match(roomSource, /hygiene: Math\.min\(100, s\.hygiene \+ CLEAN_GAIN_PER_BATH_CYCLE\)/);
  assert.doesNotMatch(roomSource, /hygiene \+ \(0\.5 \*/);
});
