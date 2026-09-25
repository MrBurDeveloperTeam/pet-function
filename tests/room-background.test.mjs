import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const petRoomSource = readFileSync(
  new URL('../src/pet/internal/PetRoom.tsx', import.meta.url),
  'utf8',
);

test('all five room backgrounds cover the desktop viewport without exposed edges', () => {
  assert.match(petRoomSource, /src=\{ROOM_BACKGROUNDS\[currentRoom\]\}/);
  assert.match(
    petRoomSource,
    /data-room-background="scene"[\s\S]*?objectFit: 'cover'[\s\S]*?objectPosition: 'center center'/,
  );
  assert.doesNotMatch(petRoomSource, /objectFit: 'fill'/);
  assert.doesNotMatch(petRoomSource, /objectFit: 'contain'/);
  assert.doesNotMatch(petRoomSource, /transform: 'scale\(1\.02\)'/);
  assert.doesNotMatch(petRoomSource, /data-room-background="fill"/);
  assert.doesNotMatch(petRoomSource, /filter: 'blur\(/);
});

test('kitchen exits match the reversed room layout', () => {
  assert.match(
    petRoomSource,
    /\[RoomType\.KITCHEN\]: \[\s*\{ direction: 'left', destination: RoomType\.GAMES, label: 'Go to games room' \},\s*\{ direction: 'right', destination: RoomType\.PLAYROOM, label: 'Go outside' \},\s*\]/,
  );
});

test('outside has a left-side exit back to the games room', () => {
  assert.match(
    petRoomSource,
    /\[RoomType\.PLAYROOM\]: \[\s*\{ direction: 'left', destination: RoomType\.GAMES, label: 'Go to games room' \},\s*\]/,
  );
});

test('keyboard movement supports all four arrow keys within room bounds', () => {
  assert.match(petRoomSource, /'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'/);
  assert.match(petRoomSource, /verticalDirection = Number\(keys\.down\) - Number\(keys\.up\)/);
  assert.match(petRoomSource, /const INDOOR_FLOOR_DEPTH:/);
  assert.match(petRoomSource, /current\.y \+ verticalDirection \* INDOOR_PET_KEYBOARD_SPEED/);
});

test('each indoor room keeps the cat inside its calibrated floor depth', () => {
  assert.match(petRoomSource, /\[RoomType\.KITCHEN\]: \{ min: -0\.03, max: 0\.26 \}/);
  assert.match(petRoomSource, /\[RoomType\.BATHROOM\]: \{ min: 0\.02, max: 0\.3 \}/);
  assert.match(petRoomSource, /\[RoomType\.BEDROOM\]: \{ min: -0\.08, max: 0\.15 \}/);
  assert.match(petRoomSource, /\[RoomType\.GAMES\]: \{ min: -0\.07, max: 0\.24 \}/);
});

test('indoor cats use room-specific rug placements and a smaller bedroom scale', () => {
  assert.match(petRoomSource, /\[RoomType\.KITCHEN\]: \{ x: 0\.48, y: 0\.11 \}/);
  assert.match(petRoomSource, /\[RoomType\.BATHROOM\]: \{ x: 0\.48, y: 0\.28 \}/);
  assert.match(petRoomSource, /\[RoomType\.BEDROOM\]: \{ x: 0\.5, y: -0\.04 \}/);
  assert.match(petRoomSource, /\[RoomType\.GAMES\]: \{ x: 0\.48, y: 0\.06 \}/);
  assert.match(petRoomSource, /const BEDROOM_PET_SCALE_MULTIPLIER = 0\.8/);
  assert.match(petRoomSource, /displayScale=\{bedroomSceneScale \* BEDROOM_PET_SCALE_MULTIPLIER\}/);
});
