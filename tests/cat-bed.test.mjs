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

test('sleeping cat fits inside the bed without blocking its wake button', () => {
  assert.match(mascot, /molar-cat-wrapper--in-bed/);
  assert.match(css, /\.molar-cat-wrapper--in-bed \.molar-cat-sprite[\s\S]*?transform: scale\(0\.68\)/);
  assert.match(css, /\.molar-cat-wrapper--in-bed \[data-cat='true'\][\s\S]*?pointer-events: none !important/);
  assert.match(css, /\.molar-cat-bed[\s\S]*?width: 4rem;[\s\S]*?height: 4rem;[\s\S]*?background: transparent/);
});

test('cat bed is keyboard-visible and respects reduced motion', () => {
  assert.match(css, /\.molar-cat-bed:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
