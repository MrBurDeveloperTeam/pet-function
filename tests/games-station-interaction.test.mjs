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

test('games are hidden until the television or arcade station is activated', () => {
  assert.match(roomSource, /const \[showGamesMenu, setShowGamesMenu\] = useState\(false\)/);
  assert.match(outlinesSource, /label: 'Play games on the television'/);
  assert.match(outlinesSource, /aria-label=\{label\}/);
  assert.match(roomSource, /event\.code !== 'Space'/);
  assert.match(roomSource, /isNearGameStation/);
  assert.match(roomSource, /currentRoom === RoomType\.GAMES && showGamesMenu/);
});

test('game choices appear in a closable pixel dialog', () => {
  assert.match(menusSource, /role="dialog"/);
  assert.match(menusSource, /aria-modal="true"/);
  assert.match(menusSource, /border-\[5px\] border-\[#4b2b20\]/);
  assert.match(menusSource, /onClose: \(\) => void/);
  assert.match(menusSource, /Close game menu/);
});

test('the open game menu closes with Space or Escape', () => {
  assert.match(roomSource, /event\.key !== 'Escape' && event\.code !== 'Space'/);
  assert.match(roomSource, /setShowGamesMenu\(false\)/);
});
