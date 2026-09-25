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

test('games are hidden until the television or arcade station is activated', () => {
  assert.match(roomSource, /const \[showGamesMenu, setShowGamesMenu\] = useState\(false\)/);
  assert.match(roomSource, /aria-label="Interact with the television and arcade machines"/);
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
