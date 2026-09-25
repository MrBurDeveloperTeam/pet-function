import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const petRoomSource = readFileSync(new URL('../src/pet/internal/PetRoom.tsx', import.meta.url), 'utf8');
const typesSource = readFileSync(new URL('../src/pet/internal/types.ts', import.meta.url), 'utf8');
const backgroundsSource = readFileSync(new URL('../src/pet/internal/roomBackgrounds.ts', import.meta.url), 'utf8');
const navigationSource = readFileSync(new URL('../src/pet/internal/outdoorNavigation.ts', import.meta.url), 'utf8');

test('games, town, shopping street and sports ground form the requested route', () => {
  assert.match(typesSource, /TOWN_HOME = 'TOWN_HOME'/);
  assert.match(typesSource, /SHOPPING_STREET = 'SHOPPING_STREET'/);
  assert.match(typesSource, /SPORTS_GROUND = 'SPORTS_GROUND'/);
  assert.match(petRoomSource, /RoomType\.GAMES[\s\S]*?destination: RoomType\.TOWN_HOME/);
  assert.match(petRoomSource, /RoomType\.TOWN_HOME[\s\S]*?direction: 'left', destination: RoomType\.SHOPPING_STREET/);
  assert.match(petRoomSource, /RoomType\.SHOPPING_STREET[\s\S]*?direction: 'down', destination: RoomType\.SPORTS_GROUND/);
  assert.match(petRoomSource, /RoomType\.SPORTS_GROUND[\s\S]*?direction: 'up', destination: RoomType\.SHOPPING_STREET/);
});

test('all three connected outdoor scenes use their generated backgrounds', () => {
  assert.match(backgroundsSource, /town-home\.png/);
  assert.match(backgroundsSource, /shopping-street\.png/);
  assert.match(backgroundsSource, /sports-ground\.png/);
});

test('keyboard and pointer movement share authored outdoor collision constraints', () => {
  assert.match(navigationSource, /\[RoomType\.TOWN_HOME\]/);
  assert.match(navigationSource, /\[RoomType\.SHOPPING_STREET\]/);
  assert.match(navigationSource, /\[RoomType\.SPORTS_GROUND\]/);
  assert.match(petRoomSource, /outsidePointerTargetRef\.current = constrainOutdoorPosition/);
  assert.match(petRoomSource, /const next = constrainOutdoorPosition\(currentRoom, current, requestedNext/);
  assert.match(petRoomSource, /'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's'/);
});
