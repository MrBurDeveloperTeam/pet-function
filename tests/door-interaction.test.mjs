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

test('Space activates a door only while the cat is beside it', () => {
  assert.match(roomSource, /const ROOM_DOOR_PROXIMITY:/);
  assert.match(roomSource, /event\.code !== 'Space'/);
  assert.match(roomSource, /petXRatio < doorProximity\.min \|\| petXRatio > doorProximity\.max/);
  assert.match(roomSource, /startRoomTransition\(doorExit\)/);
});
