import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mascot = readFileSync('src/cat/SharedCatMascot.tsx', 'utf8');
const ai = readFileSync('src/ai/SharedMolarAI.tsx', 'utf8');
const css = readFileSync('src/styles/index.css', 'utf8');
const sleepSync = readFileSync('src/cat/useSharedCatSleepSync.ts', 'utf8');

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
  assert.match(mascot, /molar-cat-bed__sleeping-cat/);
  assert.match(mascot, /isCatBedSleepReady &&/);
  assert.match(css, /\.molar-cat-bed__sleeping-cat[\s\S]*?transform: translateX\(-50%\) scale\(0\.56\)/);
  assert.match(css, /\.molar-cat-bed__sleeping-cat \.molar-cat-sprite[\s\S]*?pointer-events: none/);
  assert.match(css, /\.molar-cat-bed[\s\S]*?width: 4rem;[\s\S]*?height: 4rem;[\s\S]*?background: transparent/);
  assert.match(css, /\.molar-cat-sprite \{[\s\S]*?display: block/);
  assert.match(mascot, /cat_bed_pixel\.png\?v=0\.9\.30/);
});

test('cat bed suppresses dialogue while sleeping and restores the mounted layer on wake', () => {
  assert.match(mascot, /molar-cat-wrapper--bed-active/);
  assert.match(mascot, /molar-cat-dialogue-layer/);
  assert.match(css, /\.molar-cat-wrapper--bed-active \.molar-cat-dialogue-layer[\s\S]*?display: none/);
});

test('account sleep state persists to Supabase and is wired through all seven hosts', () => {
  assert.match(sleepSync, /table: 'inventory_pet'/);
  assert.match(sleepSync, /update\(\{ is_sleeping: sleeping \}\)/);
  assert.match(sleepSync, /postgres_changes/);
  assert.match(sleepSync, /addEventListener\('focus'/);
  assert.match(sleepSync, /select\('is_sleeping'\)/);
  const hostFiles = [
    'src/apps/AppointmentCatMascot.jsx',
    'src/apps/InventoryCatMascot.jsx',
    'src/apps/calculator/CalculatorCatMascot.jsx',
    'src/apps/todo/TodoCatMascot.jsx',
    'src/apps/elearning/ElearningCatMascot.jsx',
    'src/apps/image-generator/ContentStudioCatMascot.jsx',
    'src/apps/superapp/SuperappCatMascot.tsx',
  ];
  for (const file of hostFiles) {
    const host = readFileSync(file, 'utf8');
    assert.match(host, /useSharedCatSleepSync/);
    assert.match(host, /onSleepingChange=\{handleCatBedSleepChange\}/);
  }
});

test('cat bed is offset toward the right edge while the sleeping cat stays nested', () => {
  assert.match(mascot, /const CAT_BED_RIGHT_OFFSET = 12/);
  assert.match(mascot, /- CAT_BED_RIGHT_OFFSET/);
  assert.match(mascot, /molar-cat-bed__sleeping-cat[\s\S]*?\{catSprite\}/);
});

test('cat bed is keyboard-visible and respects reduced motion', () => {
  assert.match(css, /\.molar-cat-bed:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
