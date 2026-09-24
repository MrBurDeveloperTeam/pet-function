import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const petRoomSource = readFileSync(
  new URL('../src/pet/internal/PetRoom.tsx', import.meta.url),
  'utf8',
);

test('all five ultra-wide room backgrounds fill the viewport as one complete scene', () => {
  assert.match(petRoomSource, /src=\{ROOM_BACKGROUNDS\[currentRoom\]\}/);
  assert.match(
    petRoomSource,
    /data-room-background="scene"[\s\S]*?objectFit: 'fill'[\s\S]*?objectPosition: 'center center'/,
  );
  assert.doesNotMatch(petRoomSource, /data-room-background="fill"/);
  assert.doesNotMatch(petRoomSource, /filter: 'blur\(/);
});
