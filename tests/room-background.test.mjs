import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const petRoomSource = readFileSync(
  new URL('../src/pet/internal/PetRoom.tsx', import.meta.url),
  'utf8',
);

test('all five room backgrounds remain fully visible without cover cropping', () => {
  assert.match(petRoomSource, /src=\{ROOM_BACKGROUNDS\[currentRoom\]\}/);
  assert.match(petRoomSource, /objectFit: 'contain'/);
  assert.match(petRoomSource, /objectPosition: 'center center'/);
  assert.doesNotMatch(petRoomSource, /objectFit: 'cover'/);
});
