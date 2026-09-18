import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
const result = await build({ entryPoints: [resolve('src/pet/internal/bedImages.ts')], bundle: true, write: false, platform: 'node', format: 'esm' });
const images = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
test('Built-in beds ignore stale catalog URLs; custom beds retain their images', () => {
  for (const color of ['grey', 'red', 'purple']) assert.equal(images.resolveBedImage('bed_' + color, '/images/broken.png'), '/pet-function/pet/' + color + '_bed.png?v=0.9.21');
  assert.equal(images.resolveBedImage('custom', 'https://example.test/bed.png'), 'https://example.test/bed.png');
  assert.equal(images.resolveBedImage('bed_red', '/broken', {red:'/override.png'}), '/override.png');
});
test('Bed fallback is finite, deduplicated, and ends with network-independent artwork', () => {
  const candidates = images.bedImageCandidates('/broken.png');
  assert.equal(candidates[1], '/pet-function/pet/grey_bed.png?v=0.9.21');
  assert.ok(candidates.at(-1).startsWith('data:image/svg+xml,'));
  assert.equal(images.bedImageCandidates('/pet-function/pet/grey_bed.png?v=0.9.21').length, 2);
});
test('Public pet option paths all point to shipped shared resources', () => {
  const text = readFileSync('src/pet/publicOptions.ts', 'utf8');
  assert.equal(text.includes("spriteSheetUrl: '/images/"), false);
  const paths = [...text.matchAll(/spriteSheetUrl: '([^']+)'/g)];
  assert.equal(paths.length, 6);
  for (const [, path] of paths) assert.ok(existsSync('public' + path), path);
});
