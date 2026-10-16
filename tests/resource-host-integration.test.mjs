import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, request } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { sharedGamesPlugin } from '../scripts/vite-games.mjs';
import { verifyPublicResources } from '../scripts/verify-public-resources.mjs';
import { ensurePublicResources } from '../scripts/sync-resource-packs.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha256 = data => createHash('sha256').update(data).digest('hex');
const write = (path, data) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data); };

function fixture(t) {
  const temporary = mkdtempSync(join(tmpdir(), 'pet-resource-host-'));
  t.after(() => {
    assert.ok(resolve(temporary).startsWith(resolve(tmpdir())));
    rmSync(temporary, { recursive: true, force: true });
  });
  const core = join(temporary, 'installed-core');
  const assets = join(temporary, 'release');
  const cache = join(temporary, 'cache');
  const host = join(temporary, 'host');
  const content = new Map([
    ['games/demo/index.html', Buffer.from('<html>canonical game</html>')],
    ['games/demo/index.js', Buffer.from('globalThis.gameLoaded = true;')],
    ['games/demo/index.wasm', Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])],
    ['games/demo/index.pck', Buffer.from('canonical Godot pack')],
    ['pet-function/cats/default.png', Buffer.from('bundled core fallback image')],
    ['pet-function/wardrobe/outfit.webp', Buffer.from('downloaded wardrobe image')],
    ['pet-function/fonts/game.woff2', Buffer.from('downloaded font')],
  ]);
  const archive = gzipSync(Buffer.from([...content].map(([path, data]) => JSON.stringify([path, 0, data.toString('base64')]) + '\n').join('')));
  const partName = 'resource-pack-test.jsonl.gz.part00001';
  const manifest = {
    schemaVersion: 1, version: '0.10.0', repository: 'MrBurDeveloperTeam/pet-function', tag: 'v0.10.0',
    files: [...content].map(([path, data]) => ({ path, size: data.length, sha256: sha256(data) })),
    packs: [{ id: 'test-resources', files: [...content.keys()], parts: [{ name: partName, size: archive.length, sha256: sha256(archive) }] }],
  };
  write(join(core, 'package.json'), JSON.stringify({ name: '@mrburdeveloperteam/pet-function', version: manifest.version, type: 'module' }));
  write(join(core, 'resource-manifest.json'), JSON.stringify(manifest));
  // The core ships only statically imported fallback art, never game data or the
  // wardrobe catalog. A real cold release restore must fill in everything else.
  write(join(core, 'public/pet-function/cats/default.png'), content.get('pet-function/cats/default.png'));
  write(join(assets, partName), archive);
  write(join(host, 'package.json'), JSON.stringify({ name: 'test-host' }));
  write(join(host, 'public/favicon.ico'), 'host favicon');
  write(join(host, 'public/games/demo/index.html'), 'stale host game');
  write(join(host, 'public/games/removed/index.pck'), 'stale removed game');
  write(join(host, 'public/pet-function/wardrobe/outfit.webp'), 'stale host outfit');
  write(join(host, 'public/pet-function/removed.webp'), 'stale removed image');
  return { temporary, core, assets, cache, host, content, archive, partName, manifest };
}

async function listen(t, plugin) {
  let middleware;
  plugin.configureServer({ middlewares: { use(fn) { middleware = fn; } } });
  const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 418; res.end('host fallback'); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const address = server.address();
  return (path, method = 'GET') => new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: address.port, path, method }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, data: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('installed core restores release resources before serving games and pet artwork', async t => {
  const f = fixture(t);
  let downloads = 0;
  const plugin = sharedGamesPlugin({ packageRoot: f.core, resourceOptions: {
    cacheDir: f.cache, baseUrl: 'https://resources.invalid/v0.10.0/',
    fetchImpl: async url => {
      if (url.endsWith('/resource-manifest.json')) return new Response(JSON.stringify(f.manifest));
      assert.ok(url.endsWith('/' + f.partName));
      downloads++;
      return new Response(f.archive);
    },
  } });
  assert.deepEqual(plugin.config(), { build: { copyPublicDir: false } });
  const get = await listen(t, plugin);
  const types = new Map([
    ['games/demo/index.html', 'text/html; charset=utf-8'], ['games/demo/index.js', 'text/javascript; charset=utf-8'],
    ['games/demo/index.wasm', 'application/wasm'], ['games/demo/index.pck', 'application/octet-stream'],
    ['pet-function/cats/default.png', 'image/png'], ['pet-function/wardrobe/outfit.webp', 'image/webp'],
    ['pet-function/fonts/game.woff2', 'font/woff2'],
  ]);
  for (const [path, expected] of f.content) {
    const response = await get('/' + path + '?v=cache-bust');
    assert.equal(response.status, 200, path);
    assert.equal(response.headers['content-type'], types.get(path));
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.deepEqual(response.data, expected);
  }
  assert.equal(downloads, 1, 'concurrent lifecycle/resource requests share the matching release restore');
  assert.deepEqual((await get('/games/demo/')).data, f.content.get('games/demo/index.html'));
  assert.equal((await get('/pet-function/wardrobe/outfit.webp', 'HEAD')).data.length, 0);
  assert.equal((await get('/games/removed/index.pck')).status, 404);
  assert.equal((await get('/pet-function/removed.webp')).status, 404);
  assert.equal((await get('/favicon.ico')).status, 418);
  assert.equal(existsSync(join(f.core, 'public/games/demo/index.pck')), false, 'cache restore does not require writable node_modules');
});

test('resource middleware rejects traversal on both Windows and Unix hosts', async t => {
  const f = fixture(t);
  const get = await listen(t, sharedGamesPlugin({ packageRoot: f.core, resourceOptions: { assetsDir: f.assets, cacheDir: f.cache } }));
  for (const path of [
    '/games/%2e%2e%2fpackage.json', '/pet-function/%2e%2e%2fpackage.json',
    '/games/demo%5c..%5cpackage.json', '/pet-function/C:%5cWindows%5cwin.ini',
    '/games/C:/Windows/win.ini', '/games//etc/passwd', '/games/demo/%00.js',
  ]) assert.equal((await get(path)).status, 403, path);
  assert.equal((await get('/games/%invalid')).status, 400);
});

test('build copies canonical release resources before host postprocessing and retains unrelated host public files', async t => {
  const f = fixture(t);
  const plugin = sharedGamesPlugin({ packageRoot: f.core, resourceOptions: { assetsDir: f.assets, cacheDir: f.cache } });
  const out = join(f.host, 'dist');
  write(join(out, 'assets/host-bundle.js'), 'built host code');
  write(join(out, 'games/removed/index.pck'), 'leftover build game');
  write(join(out, 'pet-function/removed.webp'), 'leftover build image');
  await plugin.configResolved({ command: 'build', root: f.host, publicDir: join(f.host, 'public'), build: { outDir: 'dist' } });
  await plugin.buildStart();
  assert.equal(plugin.closeBundle.order, 'pre');
  assert.equal(plugin.closeBundle.sequential, true, 'Rollup must await copying before Cloudflare closeBundle hooks');
  await plugin.closeBundle.handler();
  for (const [path, data] of f.content) assert.deepEqual(readFileSync(join(out, path)), data, path);
  assert.equal(readFileSync(join(out, 'favicon.ico'), 'utf8'), 'host favicon');
  assert.equal(readFileSync(join(out, 'assets/host-bundle.js'), 'utf8'), 'built host code');
  assert.equal(existsSync(join(out, 'games/removed/index.pck')), false);
  assert.equal(existsSync(join(out, 'pet-function/removed.webp')), false);
});

test('host copy scripts synchronize thin installed packages and keep the E-learning host restriction', async t => {
  const f = fixture(t);
  for (const name of ['copy-public-assets.mjs', 'prepare-host.mjs', 'verify-public-resources.mjs', 'sync-resource-packs.mjs', 'resource-pack-format.mjs']) {
    const destination = join(f.core, 'scripts', name);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(root, 'scripts', name), destination);
  }
  const env = { ...process.env, PET_FUNCTION_RESOURCE_ASSETS_DIR: f.assets, PET_FUNCTION_RESOURCE_CACHE: f.cache };
  execFileSync(process.execPath, [join(f.core, 'scripts/copy-public-assets.mjs'), f.host], { env, stdio: 'pipe' });
  for (const [path, data] of f.content) if (path.startsWith('pet-function/')) assert.deepEqual(readFileSync(join(f.host, 'public', path)), data);
  assert.equal(readFileSync(join(f.host, 'public/favicon.ico'), 'utf8'), 'host favicon');
  assert.equal(readFileSync(join(f.host, 'public/games/demo/index.html'), 'utf8'), 'stale host game', 'game delivery belongs to the Vite plugin');
  assert.throws(() => execFileSync(process.execPath, [join(f.core, 'scripts/prepare-host.mjs'), f.host], { env, stdio: 'pipe' }), error => /may only prepare the E-learning host/.test(error.stderr.toString()));
  write(join(f.host, 'package.json'), JSON.stringify({ name: 'dental-learn' }));
  write(join(f.host, 'public/pet-function/wardrobe/outfit.webp'), 'stale again');
  execFileSync(process.execPath, [join(f.core, 'scripts/prepare-host.mjs'), f.host], { env, stdio: 'pipe' });
  assert.deepEqual(readFileSync(join(f.host, 'public/pet-function/wardrobe/outfit.webp')), f.content.get('pet-function/wardrobe/outfit.webp'));
  const restored = await ensurePublicResources(f.core, { assetsDir: f.assets, cacheDir: f.cache });
  verifyPublicResources(f.core, f.host, restored);
  write(join(f.host, 'public/pet-function/wardrobe/outfit.webp'), 'mismatched copied resource');
  assert.throws(() => verifyPublicResources(f.core, f.host, restored), /Missing or mismatched shared resource/);
});

test('legacy package and local checkout public roots remain usable without resource manifests', async t => {
  const f = fixture(t);
  const legacy = join(f.temporary, 'legacy-package');
  write(join(legacy, 'package.json'), JSON.stringify({ version: '0.9.67' }));
  for (const [path, data] of f.content) write(join(legacy, 'public', path), data);
  const get = await listen(t, sharedGamesPlugin({ packageRoot: legacy }));
  assert.deepEqual((await get('/games/demo/index.pck')).data, f.content.get('games/demo/index.pck'));
  assert.deepEqual((await get('/pet-function/wardrobe/outfit.webp')).data, f.content.get('pet-function/wardrobe/outfit.webp'));
});
