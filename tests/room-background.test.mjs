import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const petRoomSource = readFileSync(
  new URL('../src/pet/internal/PetRoom.tsx', import.meta.url),
  'utf8',
);

test('all five room backgrounds use a complete scene over a full-screen soft fill', () => {
  assert.match(petRoomSource, /src=\{ROOM_BACKGROUNDS\[currentRoom\]\}/);
  assert.match(
    petRoomSource,
    /data-room-background="fill"[\s\S]*?objectFit: 'cover'[\s\S]*?filter: 'blur\(24px\) saturate\(0\.9\)'/,
  );
  assert.match(
    petRoomSource,
    /data-room-background="scene"[\s\S]*?objectFit: 'contain'[\s\S]*?objectPosition: 'center center'/,
  );
});
