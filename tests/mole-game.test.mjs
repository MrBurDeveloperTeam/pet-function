import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const gameSource = readFileSync(new URL('../src/pet/internal/components/MoleGame.tsx', import.meta.url), 'utf8');
const roomSource = readFileSync(new URL('../src/pet/internal/PetRoom.tsx', import.meta.url), 'utf8');

test('outside renders an interactive pixel mole den with click and nearby Space entry', () => {
  assert.match(gameSource, /export const PixelMoleMound/);
  assert.match(gameSource, /Enter the underground mole game/);
  assert.match(roomSource, /<PixelMoleMound onOpen=\{\(\) => setShowMoleGame\(true\)\}/);
  assert.match(roomSource, /const isNearMoleDen = petXRatio >= 0\.66/);
  assert.match(roomSource, /event\.code !== 'Space'/);
});

test('mole game embeds the shared Godot export and persists validated rewards', () => {
  assert.match(gameSource, /\/games\/mole-game\/index\.html/);
  assert.match(gameSource, /<iframe/);
  assert.match(gameSource, /event\.origin !== window\.location\.origin/);
  assert.match(gameSource, /event\.source !== frameRef\.current\?\.contentWindow/);
  assert.match(gameSource, /message\.source === MOLE_GAME_SOURCE/);
  assert.match(gameSource, /rewardedRef\.current/);
  assert.match(gameSource, /onReward\(coins, xp\)/);
  assert.match(roomSource, /addCoins\(coins\);[\s\S]*?addXP\(xp\);/);
});

test('mole game provides a full-screen scene and loading state without a popup dialog', () => {
  assert.match(gameSource, /Underground mole game scene/);
  assert.match(gameSource, /Entering the mine/);
  assert.match(gameSource, /fixed inset-0 z-\[100\]/);
  assert.doesNotMatch(gameSource, /role="dialog"/);
});

test('opening the mole game pauses outside movement and Escape closes it', () => {
  assert.match(roomSource, /showShopModal \|\| showMoleGame \|\| isSleeping/);
  assert.match(roomSource, /event\.key !== 'Escape'/);
  assert.match(roomSource, /setShowMoleGame\(false\)/);
  assert.match(roomSource, /currentRoom === RoomType\.PLAYROOM && showMoleGame/);
});
