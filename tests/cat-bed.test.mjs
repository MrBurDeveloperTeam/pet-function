import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mascot = readFileSync('src/cat/SharedCatMascot.tsx', 'utf8');
const ai = readFileSync('src/ai/SharedMolarAI.tsx', 'utf8');
const css = readFileSync('src/styles/index.css', 'utf8');

test('cat bed follows Tutorial first and falls back to SNAI', () => {
  const tutorialLookup = mascot.indexOf('[data-pet-bed-anchor="tutorial"]');
  const snaiLookup = mascot.indexOf('[data-pet-bed-anchor="snai"]');
  assert.ok(tutorialLookup >= 0);
  assert.ok(snaiLookup > tutorialLookup);
  assert.match(ai, /data-pet-bed-anchor="snai"/);
});

test('cat bed locks page movement until the bed is activated again', () => {
  assert.match(mascot, /if \(isCatBedActiveRef\.current\) return;/);
  assert.match(mascot, /document\.addEventListener\('dblclick', handleGlobalClick\)/);
  assert.match(mascot, /aria-pressed=\{isCatBedActive\}/);
  assert.match(mascot, /isCatBedActive \? 'Wake cat up' : 'Put cat to sleep'/);
  assert.match(mascot, /isSleeping=\{isSleeping \|\| isCatBedSleepReady\}/);
});

test('cat bed is keyboard-visible and respects reduced motion', () => {
  assert.match(css, /\.molar-cat-bed:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
