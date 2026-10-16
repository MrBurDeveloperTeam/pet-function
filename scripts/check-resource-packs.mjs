import {createHash} from 'node:crypto';
import {createReadStream, existsSync, readFileSync, statSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {validateManifest} from './resource-pack-format.mjs';

async function digest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export async function checkResourcePacks(root, assetsDir = join(root, '.resource-packs'), manifestFile = join(root, 'resource-manifest.json')) {
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  validateManifest(manifest);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (manifest.version !== pkg.version || manifest.tag !== `v${pkg.version}`) throw new Error('Resource manifest and package version differ');
  const files = new Set(manifest.files.map(file => file.path));
  for (const game of ['mole-game','cat-kart','stadium-football','stadium-hurdles','air-strike']) {
    for (const name of ['index.html','index.pck']) {
      if (!files.has(`games/${game}/${name}`)) throw new Error(`Missing game resource: ${game}/${name}`);
    }
  }
  for (const name of ['index.js','index.wasm']) if (!files.has(`games/mole-game/${name}`)) throw new Error(`Missing shared Godot ${name}`);
  let bytes = 0;
  let parts = 0;
  const names = new Set();
  for (const pack of manifest.packs) for (const part of pack.parts) {
    if (names.has(part.name)) throw new Error(`Duplicate Release asset: ${part.name}`);
    names.add(part.name);
    const path = join(assetsDir, part.name);
    if (!existsSync(path) || statSync(path).size !== part.size) throw new Error(`Missing or truncated Release asset: ${part.name}`);
    if (part.size > 64 * 1024 * 1024) throw new Error(`Release asset exceeds 64 MiB: ${part.name}`);
    if (await digest(path) !== part.sha256) throw new Error(`Release asset checksum differs: ${part.name}`);
    bytes += part.size;
    parts++;
  }
  if (parts + 1 > 1000) throw new Error('This release exceeds 1000 attachments including its manifest; distribute the additional content through separate releases or storage.');
  console.log(`Resources verified: ${manifest.files.length} files in ${manifest.packs.length} packs / ${parts} parts, ${(bytes/1048576).toFixed(2)} MiB total; each part <=64 MiB`);
  return {files: manifest.files.length, packs: manifest.packs.length, parts, bytes};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const args = process.argv.slice(2);
  let assetsDir;
  let manifestFile;
  while (args.length) {
    const flag = args.shift();
    const value = args.shift();
    if (!value || !['--assets-dir','--manifest'].includes(flag)) throw new Error('Usage: node scripts/check-resource-packs.mjs [--assets-dir path] [--manifest path]');
    if (flag === '--assets-dir') assetsDir = resolve(value);
    else manifestFile = resolve(value);
  }
  await checkResourcePacks(root, assetsDir, manifestFile);
}
