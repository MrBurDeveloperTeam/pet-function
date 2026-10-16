import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertSameResourceCatalog } from '../scripts/compare-resource-catalogs.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');

function manifest() {
  return {
    schemaVersion: 1,
    version: '0.10.0',
    repository: 'MrBurDeveloperTeam/pet-function',
    tag: 'v0.10.0',
    files: [
      { path: 'games/example/index.html', size: 4, sha256: sha256('game') },
      { path: 'games/example/index.pck', size: 4, sha256: sha256('data') },
      { path: 'pet-function/decor/rug.webp', size: 3, sha256: sha256('rug') },
    ],
    packs: [
      { id: 'game-example', files: ['games/example/index.html', 'games/example/index.pck'], parts: [{ name: 'game.jsonl.gz.part00001', size: 100, sha256: sha256('compressed game') }] },
      { id: 'decor', files: ['pet-function/decor/rug.webp'], parts: [{ name: 'decor.jsonl.gz.part00001', size: 80, sha256: sha256('compressed rug') }] },
    ],
  };
}

test('release catalog comparison accepts different compression, split parts and collection ordering', () => {
  const expected = manifest();
  const actual = structuredClone(expected);
  actual.files.reverse();
  actual.packs.reverse();
  for (const pack of actual.packs) {
    pack.files.reverse();
    pack.parts = [1, 2].map(index => ({ name: `${pack.id}.rebuilt.jsonl.gz.part0000${index}`, size: index * 7, sha256: sha256(`different ${pack.id} ${index}`) }));
  }
  assert.equal(assertSameResourceCatalog(expected, actual), actual);
  assert.deepEqual(expected, manifest(), 'comparison must not mutate the expected manifest');
});

test('release catalog comparison rejects changed content, identity and pack membership', () => {
  for (const change of [
    value => { value.files[0].size++; },
    value => { value.files[0].sha256 = sha256('other'); },
    value => { value.version = '0.10.1'; value.tag = 'v0.10.1'; },
    value => { value.files[0].path = 'games/example/renamed.html'; value.packs[0].files[0] = value.files[0].path; },
    value => { value.packs[1].files.push(value.packs[0].files.pop()); },
    value => { value.packs[0].id = 'another-game-pack'; },
  ]) {
    const changed = manifest();
    change(changed);
    assert.throws(() => assertSameResourceCatalog(manifest(), changed), /catalog differs/);
  }
});

test('release catalog comparison validates both manifests before comparing', () => {
  for (const argument of ['expected', 'actual']) {
    const expected = manifest();
    const actual = manifest();
    const target = argument === 'expected' ? expected : actual;
    target.files[0].path = '../escaped';
    target.packs[0].files[0] = '../escaped';
    assert.throws(() => assertSameResourceCatalog(expected, actual), /Unsafe/);
  }
});

test('release catalog CLI is read-only and returns nonzero for incompatible resources', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pet-release-catalog-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('pet-release-catalog-'));
    await rm(directory, { recursive: true, force: true });
  });
  const expectedPath = path.join(directory, 'expected.json');
  const actualPath = path.join(directory, 'actual.json');
  const expectedText = JSON.stringify(manifest());
  await writeFile(expectedPath, expectedText);
  await writeFile(actualPath, expectedText);
  const script = fileURLToPath(new URL('../scripts/compare-resource-catalogs.mjs', import.meta.url));
  const valid = spawnSync(process.execPath, [script, expectedPath, actualPath], { encoding: 'utf8' });
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /catalog verified/);
  assert.equal(await readFile(expectedPath, 'utf8'), expectedText);
  assert.equal(await readFile(actualPath, 'utf8'), expectedText);
  const changed = manifest();
  changed.files[0].sha256 = sha256('changed');
  await writeFile(actualPath, JSON.stringify(changed));
  const invalid = spawnSync(process.execPath, [script, expectedPath, actualPath], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /catalog differs/);
});
