import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const roomSource = readFileSync(
  new URL('../src/pet/internal/PetRoom.tsx', import.meta.url),
  'utf8',
);
const outlinesSource = readFileSync(
  new URL('../src/pet/internal/components/RoomInteractionOutlines.tsx', import.meta.url),
  'utf8',
);

test('room doors lead to their requested destinations', () => {
  assert.match(roomSource, /\[RoomType\.BATHROOM\]: \{ direction: 'left', destination: RoomType\.BEDROOM, label: 'Go to bedroom through the door' \}/);
  assert.match(roomSource, /\[RoomType\.KITCHEN\]: \{ direction: 'right', destination: RoomType\.PLAYROOM, label: 'Go outside through the door' \}/);
  assert.match(roomSource, /\[RoomType\.GAMES\]: \{ direction: 'left', destination: RoomType\.TOWN_HOME, label: 'Go home through the door' \}/);
  assert.match(roomSource, /\[RoomType\.TOWN_HOME\]: \{ direction: 'right', destination: RoomType\.GAMES, label: 'Enter the games room' \}/);
  assert.match(roomSource, /\[RoomType\.SPORTS_GROUND\]: \{ direction: 'up', destination: RoomType\.SPORTS_STADIUM, label: 'Enter the sports stadium' \}/);
  assert.match(roomSource, /\[RoomType\.SPORTS_STADIUM\]: \{ direction: 'down', destination: RoomType\.SPORTS_GROUND, label: 'Leave the sports stadium' \}/);
});

test('doors use clickable pulsing contours', () => {
  assert.match(outlinesSource, /action: 'door', label: 'Go to bedroom through the bathroom door'/);
  assert.match(outlinesSource, /action: 'door', label: 'Go outside through the kitchen door'/);
  assert.match(outlinesSource, /action: 'door', label: 'Go home through the games room door'/);
  assert.match(outlinesSource, /action: 'door', label: 'Enter the games room through the home door'/);
  assert.match(outlinesSource, /className="pet-interaction-outline"/);
  assert.match(outlinesSource, /onClick=\{\(\) => onActivate\(action\)\}/);
});

test('games door prompt follows the door frame perspective', () => {
  assert.match(outlinesSource, /M257 101 L366 141 L366 446 L257 486 Z/);
});

test('town home prompt follows the stone arch instead of a wall-sized rectangle', () => {
  assert.match(outlinesSource, /M988 340 V253 C988 227 1003 214 1022 214 C1042 214 1057 229 1057 253 V340 Z/);
  assert.doesNotMatch(outlinesSource, /M989 178 H1086 V347 H989 Z/);
});

test('sports stadium entrances use fitted clickable contours', () => {
  assert.match(outlinesSource, /label: 'Enter the sports stadium'/);
  assert.match(outlinesSource, /M846 283 V203 C846 160 882 136 931 136 C980 136 1016 160 1016 203 V283 Z/);
  assert.match(outlinesSource, /label: 'Leave the sports stadium'/);
  assert.match(outlinesSource, /M647 845 V752 C720 697 810 676 931 676 C1052 676 1142 697 1215 752 V845 Z/);
});

test('Space activates a door only while the cat is beside it', () => {
  assert.match(roomSource, /const ROOM_DOOR_PROXIMITY:/);
  assert.match(roomSource, /event\.code !== 'Space'/);
  assert.match(roomSource, /petXRatio < doorProximity\.min \|\| petXRatio > doorProximity\.max/);
  assert.match(roomSource, /startRoomTransition\(doorExit\)/);
  assert.match(roomSource, /\[RoomType\.SPORTS_GROUND\]: \{ min: 0\.46, max: 0\.54, minY: 0, maxY: 0\.14 \}/);
});
