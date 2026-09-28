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

test('sports stadium door has a fitted visual-only preview contour', () => {
  assert.match(outlinesSource, /label: 'Sports stadium entrance coming soon'/);
  assert.match(outlinesSource, /M846 283 V203 C846 160 882 136 931 136 C980 136 1016 160 1016 203 V283 Z/);
  assert.match(outlinesSource, /interactive: false/);
  assert.match(outlinesSource, /pet-interaction-outline-preview/);
});

test('Space activates a door only while the cat is beside it', () => {
  assert.match(roomSource, /const ROOM_DOOR_PROXIMITY:/);
  assert.match(roomSource, /event\.code !== 'Space'/);
  assert.match(roomSource, /petXRatio < doorProximity\.min \|\| petXRatio > doorProximity\.max/);
  assert.match(roomSource, /startRoomTransition\(doorExit\)/);
});
