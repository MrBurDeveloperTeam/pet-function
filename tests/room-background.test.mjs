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
