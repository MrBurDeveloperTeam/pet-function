import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const petSource = readFileSync(new URL('../src/pet/internal/components/Pet.tsx', import.meta.url), 'utf8');
const optionsSource = readFileSync(new URL('../src/pet/internal/petOptions.ts', import.meta.url), 'utf8');
const roomSource = readFileSync(new URL('../src/pet/internal/PetRoom.tsx', import.meta.url), 'utf8');
const petIds = ['mallow', 'silverbelt', 'fastrat', 'gulu', 'munchkin', 'mochi'];

test('each cat uses the embedded tenth-row eating animation', () => {
  for (const petId of petIds) {
    assert.match(optionsSource, new RegExp(`id: '${petId}'[\\s\\S]*?eatingRow: 9[\\s\\S]*?eatingFrames: 4`));
  }
});

test('feeding uses the original selected-cat spritesheet at the original scale', () => {
  assert.match(petSource, /const SHEET_ROWS = 10/);
  assert.match(petSource, /if \(isEating && !isSleeping && sleepFrame === null\) return eatingSprite/);
  assert.match(petSource, /backgroundImage: `url\(\$\{spriteSheetUrl\}\)`/);
  assert.match(petSource, /isEating[\s\S]*mallow-vpet-sprite/);
  assert.doesNotMatch(petSource, /eatingFrameUrls|eatingSpriteSheetUrl/);
  assert.doesNotMatch(petSource, /mallow-pixel-chew|mallow-chew-mouth/);
  assert.doesNotMatch(roomSource, /eatingFrameUrls|eatingSpriteSheetUrl/);
  assert.equal((roomSource.match(/eatingRow=\{activePet\.eatingRow\}/g) || []).length, 3);
});

test('all shared sprite renderers use the ten-row sheet height', () => {
  const stylesSource = readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8');
  const adoptionSource = readFileSync(new URL('../src/pet/internal/components/PetAdoptionModal.tsx', import.meta.url), 'utf8');
  assert.match(stylesSource, /background-size: 645\.12px 873\.6px/);
  assert.match(stylesSource, /background-size: 1536px 2080px/);
  assert.match(adoptionSource, /208 \* 10 \* 0\.27/);
});
