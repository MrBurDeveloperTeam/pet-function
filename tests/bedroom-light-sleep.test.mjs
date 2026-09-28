import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const roomSource = readFileSync('src/pet/internal/PetRoom.tsx', 'utf8');

test('turning off the bedroom light walks the cat to the bed before sleeping', () => {
  assert.match(roomSource, /const \[isWalkingToBedroomBed, setIsWalkingToBedroomBed\] = useState\(false\)/);
  assert.match(roomSource, /indoorPetTargetXRef\.current = clamp\([\s\S]*?BEDROOM_SLEEP_TARGET_X_RATIO/);
  assert.match(roomSource, /indoorPetTargetYOffsetRef\.current = bounds\.rect\.height \* BEDROOM_SLEEP_TARGET_Y_RATIO/);
  assert.match(roomSource, /if \(isWalkingToBedroomBed\) \{[\s\S]*?setIsSleeping\(true\)/);
});

test('turning the light back on cancels bedtime movement and wakes the cat', () => {
  assert.match(roomSource, /const turnBedroomLightOn = \(\) => \{[\s\S]*?setIsSleeping\(false\)/);
  assert.match(roomSource, /if \(isBedroomLightOff\) turnBedroomLightOn\(\);[\s\S]*?else turnBedroomLightOff\(\)/);
});

test('waking walks the cat back to the bedroom entry position before restoring control', () => {
  assert.match(roomSource, /const \[isReturningFromBedroomBed, setIsReturningFromBedroomBed\] = useState\(false\)/);
  assert.match(roomSource, /const placement = INDOOR_INITIAL_PLACEMENT\[RoomType\.BEDROOM\]/);
  assert.match(roomSource, /indoorPetTargetXRef\.current = clamp\(bounds\.rect\.width \* placement\.x/);
  assert.match(roomSource, /indoorPetTargetYOffsetRef\.current = bounds\.rect\.height \* placement\.y/);
  assert.match(roomSource, /isSleeping \|\|[\s\S]*?isWalkingToBedroomBed \|\|[\s\S]*?isReturningFromBedroomBed \|\|[\s\S]*?roomTransition/);
  assert.match(roomSource, /else if \(isReturningFromBedroomBed\) \{[\s\S]*?setIsReturningFromBedroomBed\(false\)/);
});

test('the room dims during the walk and the sleep pose stays on the bed', () => {
  assert.match(roomSource, /const isBedroomLightOff = isSleeping \|\| isWalkingToBedroomBed/);
  assert.match(roomSource, /currentRoom === RoomType\.BEDROOM && isBedroomLightOff/);
  assert.match(roomSource, /sleepVisualOffsetY=\{0\}/);
});
