import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { buildResourcePacks, parseResourceExclusions } from '../scripts/build-resource-packs.mjs';
import { validateManifest, validateResourcePath } from '../scripts/resource-pack-format.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pet-resource-builder-'));
  t.after(async () => {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('pet-resource-builder-'));
    await rm(resolved, { recursive: true, force: true });
  });
  await mkdir(path.join(directory, 'public'));
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ version: '0.10.0' }));
  const expected = new Map();
  async function add(relative, value) {
    const destination = path.join(directory, 'public', ...relative.split('/'));
    await mkdir(path.dirname(destination), { recursive: true });
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    await writeFile(destination, bytes);
    expected.set(relative, bytes);
  }
  return { directory, add, expected };
}

async function unpack(directory, manifest) {
  const result = new Map();
  for (const pack of manifest.packs) {
    const parts = [];
    for (const part of pack.parts) {
      const bytes = await readFile(path.join(directory, '.resource-packs', part.name));
      assert.equal(bytes.length, part.size);
      assert.equal(digest(bytes), part.sha256);
      parts.push(bytes);
    }
    for (const line of gunzipSync(Buffer.concat(parts)).toString('utf8').trimEnd().split('\n')) {
      const [resourcePath, offset, encoded] = JSON.parse(line);
      const chunk = Buffer.from(encoded, 'base64');
      const previous = result.get(resourcePath) ?? Buffer.alloc(0);
      assert.equal(offset, previous.length, 'chunk offsets must be contiguous');
      result.set(resourcePath, Buffer.concat([previous, chunk]));
    }
  }
  for (const entry of manifest.files) {
    assert.equal(result.get(entry.path)?.length, entry.size);
    assert.equal(digest(result.get(entry.path)), entry.sha256);
  }
  return result;
}

test('builder restores empty files and a single source split across many compressed release parts', async t => {
  const { directory, add, expected } = await fixture(t);
  await add('games/new-game/index.pck', randomBytes(2048));
  await add('games/new-game/index.html', '<html>New game</html>');
  await add('pet-function/new-category/empty.txt', '');
  await add('future-art/portrait.png', 'portrait');
  await add('root-file.txt', 'root');
  const manifest = await buildResourcePacks(directory, { partBytes: 71, chunkBytes: 41 });
  assert.equal(validateManifest(manifest), manifest);
  assert.deepEqual(manifest.files.map(file => file.path), [...expected.keys()].sort());
  assert.equal(manifest.packs.length, 4, 'new game, pet category, unknown category and public root are discovered');
  assert.ok(manifest.packs.find(pack => pack.files.includes('games/new-game/index.pck')).parts.length > 10);
  assert.ok(manifest.packs.every(pack => pack.parts.every(part => part.size <= 71 && /\.jsonl\.gz\.part\d+$/.test(part.name))));
  const restored = await unpack(directory, manifest);
  for (const [name, bytes] of expected) assert.deepEqual(restored.get(name), bytes, name);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'resource-manifest.json'), 'utf8')), manifest);
  assert.equal(await readFile(path.join(directory, '.resource-packs', 'resource-manifest.json'), 'utf8'), await readFile(path.join(directory, 'resource-manifest.json'), 'utf8'));
});

test('identical resources generate identical manifests and part checksums over repeated builds', async t => {
  const { directory, add } = await fixture(t);
  await add('games/example/index.html', 'a'.repeat(1024));
  await add('pet-function/wardrobe/cat.webp', Buffer.from([0, 1, 2, 3, 255]));
  const first = await buildResourcePacks(directory, { partBytes: 50, chunkBytes: 19 });
  const firstText = await readFile(path.join(directory, 'resource-manifest.json'), 'utf8');
  const firstParts = new Map(await Promise.all(first.packs.flatMap(pack => pack.parts).map(async part => [part.name, await readFile(path.join(directory, '.resource-packs', part.name))])));
  const second = await buildResourcePacks(directory, { partBytes: 50, chunkBytes: 19 });
  assert.deepEqual(second, first);
  assert.equal(await readFile(path.join(directory, 'resource-manifest.json'), 'utf8'), firstText);
  for (const [name, bytes] of firstParts) assert.deepEqual(await readFile(path.join(directory, '.resource-packs', name)), bytes);
});

test('public exclusion rules omit historical folders and individual source art while keeping runtime and core files', async t => {
  const { directory, add } = await fixture(t);
  await add('.npmignore', '# Historic/source assets only\npet-function/rooms-wide-v*/\ngames/example/source.png\ngames/example/cover &image/\n');
  await add('pet-function/rooms-wide-v2/nested/old.png', 'old');
  await add('pet-function/rooms-wide-v3/old.png', 'old');
  await add('games/example/source.png', 'source');
  await add('games/example/cover &image/ref.jpg', 'reference');
  await add('games/example/.npmignore', 'metadata');
  await add('games/example/index.html', 'runtime');
  await add('pet-function/rooms-wide/current.webp', 'current');
  await add('pet-function/poop.png', 'core fallback');
  const manifest = await buildResourcePacks(directory);
  assert.deepEqual(manifest.files.map(file => file.path), ['games/example/index.html', 'pet-function/poop.png', 'pet-function/rooms-wide/current.webp']);
  for (const rule of ['!required.png', '**/source.png', 'source?.png', '[ab].png']) assert.throws(() => parseResourceExclusions(rule), /Unsupported/);
});

test('resource path and manifest validation rejects unsafe destinations, duplicate identities and incomplete graphs', async t => {
  const { directory, add } = await fixture(t);
  await add('games/example/index.html', 'runtime');
  const manifest = await buildResourcePacks(directory);
  for (const name of ['', '/absolute', 'C:/escape', '../escape', 'a/../b', 'a//b', 'a\\b', 'a\0b', 'a/b.', 'a/CON.txt', 'a/b:stream', './a', 'a/<b>']) {
    assert.throws(() => validateResourcePath(name), /Unsafe/, name);
  }
  assert.equal(validateResourcePath('games/meowdoku/cover &image/猫.png'), 'games/meowdoku/cover &image/猫.png');
  for (const change of [
    copy => { copy.tag = 'v0.9.0'; },
    copy => { copy.repository = 'other/repo'; },
    copy => { copy.files.push({ ...copy.files[0] }); },
    copy => { copy.files.push({ ...copy.files[0], path: 'games/EXAMPLE/index.html' }); },
    copy => { copy.files.push({ ...copy.files[0], path: 'games/EXAMPLE/another.html' }); },
    copy => { copy.packs[0].parts[0].name = '../unsafe'; },
    copy => { copy.packs[0].parts[0].sha256 = 'bad'; },
    copy => { copy.packs[0].parts[0].size = 0; },
    copy => { copy.packs[0].parts[0].size = 64 * 1024 * 1024 + 1; },
    copy => { copy.packs = []; },
    copy => { copy.packs.push({ ...copy.packs[0], id: 'second-pack' }); },
    copy => { copy.files.push({ ...copy.files[0], path: 'games/example/index.html/child' }); },
  ]) {
    const copy = structuredClone(manifest);
    change(copy);
    assert.throws(() => validateManifest(copy));
  }
  await assert.rejects(buildResourcePacks(directory, { outDir: 'public/generated' }), /outside public/);
  await assert.rejects(buildResourcePacks(directory, { partBytes: 0 }), /partBytes/);
  await assert.rejects(buildResourcePacks(directory, { partBytes: 64 * 1024 * 1024 + 1 }), /partBytes/);
  await assert.rejects(buildResourcePacks(directory, { chunkBytes: 1024 * 1024 + 1 }), /chunkBytes/);
});
