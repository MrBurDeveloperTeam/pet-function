import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sharedVirtualPet = readFileSync(new URL('../src/pet/SharedVirtualPet.tsx', import.meta.url), 'utf8');
const petRoom = readFileSync(new URL('../src/pet/internal/PetRoom.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8');

test('map room selection uses the shared loading transition instead of switching immediately', () => {
  const handler = sharedVirtualPet.match(/const handleRoomMapNavigate = \(room: RoomType\) => \{([\s\S]*?)\n  \};/)?.[1] || '';

  assert.match(handler, /setRoomNavigationRequest\(\{ destination: room, requestId: Date\.now\(\) \}\)/);
  assert.doesNotMatch(handler, /setCurrentRoom\(/);
  assert.match(sharedVirtualPet, /roomNavigationRequest=\{roomNavigationRequest\}/);
  assert.match(petRoom, /setRoomTransition\(\{[\s\S]*direction: 'down',[\s\S]*destination: roomNavigationRequest\.destination/);
  assert.match(petRoom, /setIsRoomTransitionLoading\(true\)/);
});

test('loading animation always starts from the beginning and reduced-motion does not jump to the end', () => {
  assert.match(petRoom, /key=\{loadingAnimationKey\}/);
  assert.match(styles, /\.pet-room-loading-progress \{\s*width: 0;\s*animation: molar-room-loading-progress 1800ms linear both;/);
  assert.match(styles, /\.pet-room-loading-runner \{\s*left: 16px;\s*animation: molar-room-loading-runner 1800ms linear both;/);

  assert.doesNotMatch(styles, /\.pet-room-loading-progress \{[^}]*width: 100%/);
  assert.doesNotMatch(styles, /\.pet-room-loading-runner \{[^}]*left: calc\(100% - 82px\)/);
});
