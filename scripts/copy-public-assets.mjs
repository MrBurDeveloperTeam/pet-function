// Copies this package's public/ resources (pet sprites, cat sheets, AI
// assets, etc.) into a host app's own public/ directory, so Vite's dev
// server and build can pick them up as local static assets. public/games
// is skipped here on purpose — sharedGamesPlugin (see vite-games.mjs)
// serves and bundles those directly from this package instead.
//
// Meant to run from the installed package (node_modules/pet-function or
// node_modules/@mrburdeveloperteam/pet-function) against the host's cwd —
// see a host app's predev/prebuild scripts. Unlike prepare-host.mjs (the
// older sibling-checkout dev script, still used for local multi-repo
// development — see REPOSITORY-SETUP.md), this never rebuilds from
// source: dist/ ships pre-built via `npm publish`.
import { existsSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const host = resolve(process.argv[2] || process.cwd());

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

const publicDir = join(root, 'public');
if (!existsSync(publicDir)) {
  throw new Error('[pet-function] no public/ directory in the installed package at ' + root);
}

for (const source of files(publicDir)) {
  const name = relative(publicDir, source);
  if (name.split(/[\\/]/)[0] === 'games') continue; // served/bundled by sharedGamesPlugin instead
  const target = join(host, 'public', name);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}
console.log('[pet-function] public resources copied into ' + relative(process.cwd(), host));
