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

test('outdoor route map shows outdoor destinations only and marks the current location with a cat head', () => {
  for (const room of [
    'TOWN_HOME', 'SHOPPING_STREET', 'SPORTS_GROUND',
  ]) {
    assert.match(sharedVirtualPet, new RegExp(`room: RoomType\\.${room}`));
  }

  const mapItems = sharedVirtualPet.match(/const ROOM_MAP_ITEMS = \[([\s\S]*?)\] as const;/)?.[1] ?? '';
  for (const room of ['KITCHEN', 'BATHROOM', 'BEDROOM', 'GAMES', 'FISHING_POND', 'PLAYROOM']) {
    assert.doesNotMatch(mapItems, new RegExp(`RoomType\\.${room}`));
  }

  assert.match(sharedVirtualPet, /const ROOM_MAP_ROUTES = \[/);
  assert.match(sharedVirtualPet, /const PixelCatMapMarker = \(\) =>/);
  assert.match(sharedVirtualPet, /isActive && <span[\s\S]*?<PixelCatMapMarker/);
  assert.doesNotMatch(sharedVirtualPet, /rooms-wide\/outside\.png/);
  assert.match(sharedVirtualPet, /disabled=\{isActive\}/);
  assert.match(sharedVirtualPet, /onClick=\{\(\) => handleRoomMapNavigate\(room\)\}/);
});

test('indoor map keeps the original five clickable room cards', () => {
  const indoorItems = sharedVirtualPet.match(/const INDOOR_ROOM_ITEMS = \[([\s\S]*?)\] as const;/)?.[1] ?? '';
  for (const room of ['KITCHEN', 'BATHROOM', 'PLAYROOM', 'BEDROOM', 'GAMES']) {
    assert.match(indoorItems, new RegExp(`RoomType\\.${room}`));
  }
  assert.match(sharedVirtualPet, /showOutdoorTravelMap \? 'Travel map' : 'Choose a place'/);
  assert.doesNotMatch(sharedVirtualPet, /showOutdoorTravelMap = currentRoom === RoomType\.PLAYROOM/);
  assert.match(sharedVirtualPet, /INDOOR_ROOM_ITEMS\.map/);
});

test('loading animation always starts from the beginning and reduced-motion does not jump to the end', () => {
  assert.match(petRoom, /key=\{loadingAnimationKey\}/);
  assert.match(styles, /\.pet-room-loading-progress \{\s*width: 0;\s*animation: molar-room-loading-progress 1800ms linear both;/);
  assert.match(styles, /\.pet-room-loading-runner \{\s*left: 16px;\s*animation: molar-room-loading-runner 1800ms linear both;/);

  assert.doesNotMatch(styles, /\.pet-room-loading-progress \{[^}]*width: 100%/);
  assert.doesNotMatch(styles, /\.pet-room-loading-runner \{[^}]*left: calc\(100% - 82px\)/);
});
