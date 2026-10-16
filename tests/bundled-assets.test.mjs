import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, relative, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {dedupeBundledAssets} from '../scripts/dedupe-bundled-assets.mjs';

test('deduplicated ESM fallbacks still resolve to identical public files across entries', async t => {
  const root = mkdtempSync(join(tmpdir(), 'pet-function-assets-'));
  t.after(() => {
    assert.ok(relative(tmpdir(), root).startsWith('pet-function-assets-'));
    rmSync(root, {recursive: true, force: true});
  });
  mkdirSync(join(root, 'dist'));
  mkdirSync(join(root, 'public/pet-function/pets'), {recursive: true});
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  const bytes = Buffer.from('identical artwork');
  writeFileSync(join(root, 'public/pet-function/pets/cat.webp'), bytes);
  writeFileSync(join(root, 'dist/cat-HASH.webp'), bytes);
  // Same file length, different content must never be merged.
  writeFileSync(join(root, 'dist/other.webp'), Buffer.alloc(bytes.length));
  writeFileSync(join(root, 'dist/unique.svg'), '<svg/>');
  for (const entry of ['cat', 'pet']) writeFileSync(join(root, `dist/${entry}.js`), 'export const sprite = "./cat-HASH.webp";');
  assert.deepEqual(dedupeBundledAssets(root), {files: 1, bytes: bytes.length});
  assert.equal(existsSync(join(root, 'dist/cat-HASH.webp')), false);
  for (const entry of ['cat', 'pet']) {
    const {sprite} = await import(pathToFileURL(join(root, `dist/${entry}.js`)));
    assert.deepEqual(readFileSync(new URL(sprite)), bytes);
  }
  assert.deepEqual(readFileSync(join(root, 'dist/other.webp')), Buffer.alloc(bytes.length));
  assert.equal(readFileSync(join(root, 'dist/unique.svg'), 'utf8'), '<svg/>');
  assert.deepEqual(dedupeBundledAssets(root), {files: 0, bytes: 0});
});

test('public cat ESM entry renders all default sprites from the retained public files', async () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const [{createElement}, {renderToStaticMarkup}, {SharedCatMascot}] = await Promise.all([
    import('react'),
    import('react-dom/server'),
    import('../dist/cat.js'),
  ]);
  for (const petId of ['mallow', 'silverbelt', 'fastrat', 'gulu', 'munchkin', 'mochi']) {
    const markup = renderToStaticMarkup(createElement(SharedCatMascot, {petId}));
    const expected = pathToFileURL(join(root, `public/pet-function/pets/${petId}-spritesheet.webp`)).href;
    assert.ok(markup.includes(expected), `${petId} must use its published public sprite fallback`);
    assert.ok(readFileSync(new URL(expected)).length > 0);
  }
});
