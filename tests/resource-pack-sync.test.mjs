import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { ensurePublicResources } from '../scripts/sync-resource-packs.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const repository = 'MrBurDeveloperTeam/pet-function';

async function sandbox(t) {
  const directory = await mkdtemp(join(tmpdir(), 'pet-resource-sync-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function distribution(files, version = '1.2.3', options = {}) {
  const entries = Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([path, value]) => [path, Buffer.from(value)]);
  const records = options.records ?? entries.flatMap(([path, value]) => {
    if (!value.length) return [[path, 0, '']];
    const chunks = [];
    for (let offset = 0; offset < value.length; offset += 1024 * 1024) chunks.push([path, offset, value.subarray(offset, offset + 1024 * 1024).toString('base64')]);
    return chunks;
  });
  const compressed = gzipSync(options.raw ?? records.map(record => JSON.stringify(record) + '\n').join(''), { level: options.level ?? 9 });
  const split = options.split ?? compressed.length;
  const parts = [];
  const bytes = new Map();
  for (let offset = 0; offset < compressed.length; offset += split) {
    const name = `${options.prefix ?? 'resource-test'}.jsonl.gz.part${String(parts.length + 1).padStart(5, '0')}`;
    const value = compressed.subarray(offset, offset + split);
    parts.push({ name, size: value.length, sha256: sha256(value) });
    bytes.set(name, value);
  }
  return {
    manifest: { schemaVersion: 1, version, repository, tag: 'v' + version,
      files: entries.map(([path, value]) => ({ path, size: value.length, sha256: sha256(value) })),
      packs: [{ id: 'test', files: entries.map(([path]) => path), parts }] },
    bytes,
  };
}

async function fixture(t, options = {}) {
  const base = await sandbox(t);
  const root = join(base, 'installed');
  const assets = join(base, 'release');
  const cache = join(base, 'cache');
  const files = options.files ?? { 'games/football/index.html': '<html>football</html>', 'pet-function/decor/rug.webp': 'new rug bytes', 'pet-function/empty': '' };
  const release = distribution(files, options.version, options);
  await mkdir(root, { recursive: true });
  await mkdir(assets);
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@mrburdeveloperteam/pet-function', version: release.manifest.version }));
  await writeFile(join(root, 'resource-manifest.json'), JSON.stringify(release.manifest));
  await writeFile(join(assets, 'resource-manifest.json'), JSON.stringify(release.manifest));
  for (const [name, value] of release.bytes) await writeFile(join(assets, name), value);
  return { base, root, assets, cache, files, ...release };
}

async function verifyFiles(directory, files) {
  for (const [path, value] of Object.entries(files)) assert.deepEqual(await readFile(join(directory, path)), Buffer.from(value), path);
}

async function noStages(cache) {
  const buckets = await readdir(cache, { withFileTypes: true });
  for (const bucket of buckets.filter(item => item.isDirectory())) {
    assert.deepEqual((await readdir(join(cache, bucket.name))).filter(name => name.startsWith('.stage-')), []);
  }
}

function networkFor(release, requests = []) {
  return async (url, options) => {
    requests.push({ url, options });
    const name = new URL(url).pathname.split('/').at(-1);
    if (name === 'resource-manifest.json') return Response.json(release.manifest);
    if (release.bytes.has(name)) return new Response(release.bytes.get(name));
    return new Response('', { status: 404 });
  };
}

async function withToken(t, token) {
  const names = ['PET_FUNCTION_GITHUB_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN', 'PET_FUNCTION_RESOURCE_BASE_URL', 'PET_FUNCTION_RESOURCE_ASSETS_DIR'];
  const previous = new Map(names.map(name => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  if (token) process.env.PET_FUNCTION_GITHUB_TOKEN = token;
  t.after(() => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

test('local checkouts preserve live public edits and legacy full packages still work', async t => {
  const directory = await sandbox(t);
  await mkdir(join(directory, 'src'));
  await mkdir(join(directory, 'public'));
  await writeFile(join(directory, 'resource-manifest.json'), 'intentionally stale while editing');
  assert.equal(await ensurePublicResources(directory), join(directory, 'public'));
  await rm(join(directory, 'src'), { recursive: true });
  await rm(join(directory, 'resource-manifest.json'));
  assert.equal(await ensurePublicResources(directory), join(directory, 'public'));
  await rm(join(directory, 'public'), { recursive: true });
  await assert.rejects(ensurePublicResources(directory), /neither public resources nor a resource manifest/);
});

test('a complete packaged public tree is verified and used without network', async t => {
  const f = await fixture(t);
  for (const [path, value] of Object.entries(f.files)) {
    await mkdir(dirname(join(f.root, 'public', path)), { recursive: true });
    await writeFile(join(f.root, 'public', path), value);
  }
  assert.equal(await ensurePublicResources(f.root, { fetchImpl: () => assert.fail('network used') }), join(f.root, 'public'));
});

test('thin installed package restores split release parts and reuses verified cache offline', async t => {
  const f = await fixture(t, { split: 17, files: { 'games/test/index.bin': Buffer.alloc(1024 * 1024 + 3, 81), 'pet-function/empty': '' } });
  await mkdir(join(f.root, 'public'));
  await writeFile(join(f.root, 'public', 'keep.txt'), 'package contents stay unchanged');
  const cached = await ensurePublicResources(f.root, { assetsDir: f.assets, cacheDir: f.cache });
  assert.notEqual(cached, join(f.root, 'public'));
  await verifyFiles(cached, f.files);
  assert.equal(await readFile(join(f.root, 'public', 'keep.txt'), 'utf8'), 'package contents stay unchanged');
  assert.equal(await ensurePublicResources(f.root, { cacheDir: f.cache, fetchImpl: () => assert.fail('offline cache requested network') }), cached);
  await noStages(f.cache);
});

test('fixtures without a release manifest can restore against their packaged manifest', async t => {
  const f = await fixture(t);
  await rm(join(f.assets, 'resource-manifest.json'));
  await verifyFiles(await ensurePublicResources(f.root, { assetsDir: f.assets, cacheDir: f.cache }), f.files);
});

test('corrupt cached files rebuild into a fresh immutable generation', async t => {
  const f = await fixture(t);
  const first = await ensurePublicResources(f.root, { assetsDir: f.assets, cacheDir: f.cache });
  const damaged = Object.keys(f.files)[0];
  await writeFile(join(first, damaged), 'damaged');
  const repaired = await ensurePublicResources(f.root, { assetsDir: f.assets, cacheDir: f.cache });
  assert.notEqual(first, repaired);
  await verifyFiles(repaired, f.files);
  assert.equal(await readFile(join(first, damaged), 'utf8'), 'damaged');
  assert.equal(await ensurePublicResources(f.root, { cacheDir: f.cache, fetchImpl: () => assert.fail('valid repaired cache was ignored') }), repaired);
  await noStages(f.cache);
});

test('parallel synchronizers publish complete generations without deleting each other', async t => {
  const f = await fixture(t);
  const results = await Promise.all(Array.from({ length: 3 }, () => ensurePublicResources(f.root, { assetsDir: f.assets, cacheDir: f.cache })));
  for (const directory of results) await verifyFiles(directory, f.files);
  await noStages(f.cache);
});

test('different installed versions have isolated cache directories', async t => {
  const a = await fixture(t, { version: '1.0.0' });
  const b = await fixture(t, { version: '1.1.0' });
  const first = await ensurePublicResources(a.root, { assetsDir: a.assets, cacheDir: a.cache });
  const second = await ensurePublicResources(b.root, { assetsDir: b.assets, cacheDir: a.cache });
  assert.notEqual(dirname(dirname(first)), dirname(dirname(second)));
  await verifyFiles(first, a.files);
  await verifyFiles(second, b.files);
});

test('interrupted, oversized and corrupt part downloads never publish a partial cache', async t => {
  for (const mode of ['truncated', 'oversized', 'wrong-hash', 'interrupted']) {
    await t.test(mode, async t => {
      await withToken(t);
      const f = await fixture(t);
      const part = f.manifest.packs[0].parts[0];
      const bytes = f.bytes.get(part.name);
      const fetchImpl = async url => {
        if (url.endsWith('/resource-manifest.json')) return Response.json(f.manifest);
        if (mode === 'truncated') return new Response(bytes.subarray(0, -1));
        if (mode === 'oversized') return new Response(Buffer.concat([bytes, Buffer.from([0])]));
        if (mode === 'wrong-hash') { const broken = Buffer.from(bytes); broken[0] ^= 1; return new Response(broken); }
        return new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes.subarray(0, 10)); controller.error(new Error('connection interrupted')); } }));
      };
      await assert.rejects(ensurePublicResources(f.root, { baseUrl: 'https://assets.example/releases/v1.2.3/', cacheDir: f.cache, fetchImpl }));
      await noStages(f.cache);
      for (const bucket of await readdir(f.cache)) assert.deepEqual(await readdir(join(f.cache, bucket)), []);
      await verifyFiles(await ensurePublicResources(f.root, { assetsDir: f.assets, cacheDir: f.cache }), f.files);
    });
  }
});

test('release manifest accepts different compression but pins exact source files and pack membership', async t => {
  await withToken(t);
  const f = await fixture(t);
  const remote = distribution(f.files, f.manifest.version, { level: 0, prefix: 'built-on-ci', split: 25 });
  assert.notDeepEqual(remote.manifest.packs[0].parts, f.manifest.packs[0].parts);
  const requests = [];
  await verifyFiles(await ensurePublicResources(f.root, { baseUrl: 'https://assets.example/v1.2.3/', cacheDir: f.cache, fetchImpl: networkFor(remote, requests) }), f.files);
  assert.ok(requests.some(({ url }) => url.includes('built-on-ci')));
  const other = await fixture(t);
  const mismatched = distribution({ ...other.files, 'games/extra.html': 'unexpected file' }, other.manifest.version);
  await assert.rejects(ensurePublicResources(other.root, { baseUrl: 'https://assets.example/v1.2.3/', cacheDir: other.cache, fetchImpl: networkFor(mismatched) }), /catalog does not match/);
  await noStages(other.cache);
});

test('local release manifest also accepts CI compression and rejects a different file catalog', async t => {
  const f = await fixture(t);
  const remote = distribution(f.files, f.manifest.version, { prefix: 'alternative', level: 1 });
  await writeFile(join(f.assets, 'resource-manifest.json'), JSON.stringify(remote.manifest));
  for (const [name, value] of remote.bytes) await writeFile(join(f.assets, name), value);
  await verifyFiles(await ensurePublicResources(f.root, { assetsDir: f.assets, cacheDir: f.cache }), f.files);
  const other = await fixture(t);
  const wrong = structuredClone(other.manifest);
  wrong.files[0].sha256 = '0'.repeat(64);
  await writeFile(join(other.assets, 'resource-manifest.json'), JSON.stringify(wrong));
  await assert.rejects(ensurePublicResources(other.root, { assetsDir: other.assets, cacheDir: other.cache }), /catalog does not match/);
});

test('unsafe manifests and package version mismatches fail before downloading', async t => {
  for (const mutate of [
    manifest => { manifest.files[0].path = '../escaped'; manifest.packs[0].files[0] = '../escaped'; },
    manifest => { manifest.packs[0].parts[0].name = '../escaped'; },
    manifest => { manifest.files.push({ ...manifest.files[0] }); },
  ]) {
    const f = await fixture(t);
    mutate(f.manifest);
    await writeFile(join(f.root, 'resource-manifest.json'), JSON.stringify(f.manifest));
    await assert.rejects(ensurePublicResources(f.root, { fetchImpl: () => assert.fail('invalid manifest downloaded') }), /manifest is invalid/);
  }
  const f = await fixture(t);
  await writeFile(join(f.root, 'package.json'), JSON.stringify({ version: '9.9.9' }));
  await assert.rejects(ensurePublicResources(f.root), /version does not match/);
});

test('unpacked records reject traversal, duplicates, gaps, bad base64, missing and extra files', async t => {
  const files = { 'pet-function/a': 'A', 'pet-function/b': 'B' };
  const a = ['pet-function/a', 0, 'QQ=='];
  const b = ['pet-function/b', 0, 'Qg=='];
  const cases = [
    [['../escaped', 0, 'QQ=='], b],
    [a, a, b],
    [b, a],
    [['pet-function/a', 1, 'QQ=='], b],
    [['pet-function/a', 0, 'Q==='], b],
    [a],
    [a, b, ['pet-function/c', 0, 'Qw==']],
    [['pet-function/a', 0, ''], b],
    [['pet-function/a', 0, 'Qg=='], b],
  ];
  for (const records of cases) {
    const f = await fixture(t, { files, records });
    await assert.rejects(ensurePublicResources(f.root, { assetsDir: f.assets, cacheDir: f.cache }));
    await noStages(f.cache);
    await assert.rejects(readFile(join(f.base, 'escaped')), { code: 'ENOENT' });
  }
});

test('records and decoded chunks have bounded memory and require a complete JSONL ending', async t => {
  for (const options of [
    { raw: '[' + ' '.repeat(2 * 1024 * 1024) },
    { records: [['pet-function/a', 0, Buffer.alloc(1024 * 1024 + 1).toString('base64')]] },
    { raw: JSON.stringify(['pet-function/a', 0, 'QQ==']) },
    { raw: '\n' },
  ]) {
    const f = await fixture(t, { files: { 'pet-function/a': 'A' }, ...options });
    await assert.rejects(ensurePublicResources(f.root, { assetsDir: f.assets, cacheDir: f.cache }));
    await noStages(f.cache);
  }
});

test('private GitHub release downloads send credentials only to the GitHub API', async t => {
  await withToken(t, 'test-secret-never-forward');
  const f = await fixture(t);
  const part = f.manifest.packs[0].parts[0];
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (url.includes('/releases/tags/')) return Response.json({ assets: [{ name: 'resource-manifest.json', id: 101 }, { name: part.name, id: 102, size: part.size }] });
    if (url.endsWith('/releases/assets/101')) return new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/manifest' } });
    if (url.endsWith('/releases/assets/102')) return new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/part' } });
    if (url.endsWith('/manifest')) return Response.json(f.manifest);
    if (url.endsWith('/part')) return new Response(f.bytes.get(part.name));
    assert.fail('unexpected fetch ' + url);
  };
  await verifyFiles(await ensurePublicResources(f.root, { cacheDir: f.cache, fetchImpl }), f.files);
  for (const request of requests) {
    const authorization = request.options.headers.Authorization;
    assert.equal(authorization, request.url.startsWith('https://api.github.com/') ? 'Bearer test-secret-never-forward' : undefined);
    assert.equal(request.options.redirect, 'manual');
  }
  const custom = await fixture(t);
  const customRequests = [];
  await ensurePublicResources(custom.root, { cacheDir: custom.cache, baseUrl: 'https://assets.example/v1.2.3/', fetchImpl: networkFor(custom, customRequests) });
  assert.ok(customRequests.every(request => !request.options.headers.Authorization));
});

test('missing releases provide an actionable error and unsafe redirects are refused', async t => {
  await withToken(t);
  const f = await fixture(t);
  await assert.rejects(ensurePublicResources(f.root, { cacheDir: f.cache, fetchImpl: async () => new Response('', { status: 404 }) }), /Publish the matching GitHub Release/);
  await assert.rejects(ensurePublicResources(f.root, { cacheDir: f.cache, baseUrl: 'https://assets.example/v1.2.3/', fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'file:///etc/passwd' } }) }), /unsafe redirect/);
  await assert.rejects(ensurePublicResources(f.root, { cacheDir: f.cache, baseUrl: 'https://assets.example/v1.2.3/', fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'http://assets.example/part' } }) }), /insecure redirect/);
  await noStages(f.cache);
});
