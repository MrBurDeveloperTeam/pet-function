import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const petRoomSource = readFileSync(new URL('../src/pet/internal/PetRoom.tsx', import.meta.url), 'utf8');
const typesSource = readFileSync(new URL('../src/pet/internal/types.ts', import.meta.url), 'utf8');
const backgroundsSource = readFileSync(new URL('../src/pet/internal/roomBackgrounds.ts', import.meta.url), 'utf8');
const navigationSource = readFileSync(new URL('../src/pet/internal/outdoorNavigation.ts', import.meta.url), 'utf8');

test('games, town, shopping street, sports ground and stadium form the requested route', () => {
  assert.match(typesSource, /TOWN_HOME = 'TOWN_HOME'/);
  assert.match(typesSource, /SHOPPING_STREET = 'SHOPPING_STREET'/);
  assert.match(typesSource, /SPORTS_GROUND = 'SPORTS_GROUND'/);
  assert.match(typesSource, /SPORTS_STADIUM = 'SPORTS_STADIUM'/);
  assert.match(petRoomSource, /RoomType\.GAMES[\s\S]*?destination: RoomType\.TOWN_HOME/);
  assert.match(petRoomSource, /RoomType\.TOWN_HOME[\s\S]*?direction: 'left', destination: RoomType\.SHOPPING_STREET/);
  assert.match(petRoomSource, /RoomType\.SHOPPING_STREET[\s\S]*?direction: 'down', destination: RoomType\.SPORTS_GROUND/);
  assert.match(petRoomSource, /RoomType\.SPORTS_GROUND[\s\S]*?direction: 'up', destination: RoomType\.SHOPPING_STREET/);
  assert.match(petRoomSource, /RoomType\.SPORTS_STADIUM[\s\S]*?direction: 'down', destination: RoomType\.SPORTS_GROUND/);
});

test('all connected outdoor scenes use their generated backgrounds', () => {
  assert.match(backgroundsSource, /town-home\.png/);
  assert.match(backgroundsSource, /shopping-street\.png/);
  assert.match(backgroundsSource, /sports-ground\.png/);
  assert.match(backgroundsSource, /sports-stadium\.png/);
});

test('keyboard and pointer movement share authored outdoor collision constraints', () => {
  assert.match(navigationSource, /\[RoomType\.TOWN_HOME\]/);
  assert.match(navigationSource, /\[RoomType\.SHOPPING_STREET\]/);
  assert.match(navigationSource, /\[RoomType\.SPORTS_GROUND\]/);
  assert.match(navigationSource, /\[RoomType\.SPORTS_STADIUM\]/);
  assert.match(petRoomSource, /outsidePointerTargetRef\.current = constrainOutdoorPosition/);
  assert.match(petRoomSource, /const next = constrainOutdoorPosition\(currentRoom, current, requestedNext/);
  assert.match(petRoomSource, /'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's'/);
});

test('town scenes use half-size cats and a collapsible top status control', () => {
  assert.match(petRoomSource, /const TOWN_PET_SCALE = OUTSIDE_PET_SCALE \* 0\.5/);
  assert.match(petRoomSource, /displayScale=\{getOutdoorPetScale\(currentRoom\)\}/);
  assert.match(petRoomSource, /aria-label=\{showTownStats \? 'Hide pet status' : 'Show pet status'\}/);
  assert.match(petRoomSource, /showTownStats && <StatsBar stats=\{stats\}/);
  assert.match(petRoomSource, /const PixelStatsToggle/);
  assert.match(petRoomSource, /<PixelStatsToggle expanded=\{showTownStats\}/);
  assert.match(petRoomSource, /h-8 w-8/);
});

test('reaching a town road edge automatically changes scene while exit arrows remain clickable', () => {
  assert.match(petRoomSource, /const AUTO_TOWN_EXIT_ROOMS = new Set<RoomType>/);
  assert.match(petRoomSource, /AUTO_TOWN_EXIT_ROOMS\.has\(currentRoom\)/);
  assert.match(petRoomSource, /startRoomTransition\(nearbyExit\)/);
  assert.doesNotMatch(petRoomSource, /event\.code === 'Space' && TOWN_ROOMS\.has\(currentRoom\)/);
  assert.match(petRoomSource, /onClick=\{\(\) => startRoomTransition\(exit\)\}/);
  assert.match(petRoomSource, /sportsTopExitY = \(\(208 \* getOutdoorPetScale\(currentRoom\)\) \/ 2\) \/ Math\.max\(rect\.height, 1\) \+ 0\.015/);
  assert.match(petRoomSource, /isMovingTowardSportsExit = outsideMovementKeysRef\.current\.up/);
  assert.match(petRoomSource, /isMovingTowardSportsExit && y <= sportsTopExitY/);
});

test('sports ground return stays left of center and the stadium has a navigable pitch and track', () => {
  assert.match(petRoomSource, /isSportsGroundReturn/);
  assert.match(petRoomSource, /left-\[39%\] top-8/);
  assert.match(navigationSource, /\{ x: 0\.54, y: 0\.095 \}, \{ x: 0\.46, y: 0\.095 \}/);
  assert.match(navigationSource, /RoomType\.SPORTS_GROUND\]: \{ x: 0\.5, y: 0\.075 \}/);
  assert.match(navigationSource, /RoomType\.SPORTS_STADIUM\]: \{ x: 0\.5, y: 0\.84 \}/);
  assert.match(navigationSource, /\{ x: 0\.08, y: 0\.31 \}, \{ x: 0\.92, y: 0\.31 \}/);
});

test('town route entry positions depend on the scene the cat came from', () => {
  assert.match(petRoomSource, /RoomType\.SHOPPING_STREET[\s\S]*?RoomType\.SPORTS_GROUND\]: \{ x: 0\.5, y: 0\.075 \}/);
  assert.match(petRoomSource, /RoomType\.SHOPPING_STREET[\s\S]*?RoomType\.TOWN_HOME\]: \{ x: 0\.14, y: 0\.30 \}/);
  assert.match(petRoomSource, /RoomType\.SPORTS_GROUND[\s\S]*?RoomType\.SHOPPING_STREET\]: \{ x: 0\.33, y: 0\.82 \}/);
  assert.match(petRoomSource, /RoomType\.SPORTS_GROUND[\s\S]*?RoomType\.SPORTS_STADIUM\]: \{ x: 0\.5, y: 0\.84 \}/);
  assert.match(petRoomSource, /RoomType\.SPORTS_STADIUM[\s\S]*?RoomType\.SPORTS_GROUND\]: \{ x: 0\.5, y: 0\.075 \}/);
  assert.match(petRoomSource, /outdoorEntryPlacementRef\.current\?\.room === currentRoom/);
});
