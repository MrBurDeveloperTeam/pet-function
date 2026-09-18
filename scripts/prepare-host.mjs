// Host delivery for both a sibling checkout and a Git-installed dependency.
import { existsSync, readdirSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPublicResources } from './verify-public-resources.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const host = resolve(process.argv[2] || process.cwd());
let hostPkgName;
try { hostPkgName = JSON.parse(readFileSync(join(host, 'package.json'), 'utf8')).name; } catch {}
if (hostPkgName !== 'dental-learn') {
  throw new Error('pet-function pilot may only prepare the E-learning host (package.json name "dental-learn"): ' + host + (hostPkgName ? ' (found "' + hostPkgName + '")' : ''));
}
if (!existsSync(join(root, 'public'))) throw new Error('pet-function public resources are missing: ' + root);
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
for (const source of files(join(root, 'public'))) {
  const name = relative(join(root, 'public'), source);
  const parts = name.split(/[\\/]/);
  if (parts[0] === 'games' || parts[0] === 'pets') continue;
  if (parts[0] === 'images' && parts.at(-1) !== 'cat-meow.mp3') continue;
  const target = join(host, 'public', name);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}
verifyPublicResources(root, host);
console.log('[pet-function] resources ready for E-learning from ' + root);
