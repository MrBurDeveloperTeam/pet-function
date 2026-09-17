// Host delivery for both a sibling checkout and a Git-installed dependency.
import { existsSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const host = resolve(process.argv[2] || process.cwd());
if (basename(host).toLowerCase() !== 'e-learning') {
  throw new Error('pet-function pilot may only prepare the E-learning host: ' + host);
}
if (!existsSync(join(root, 'dist', 'pet.js'))) {
  throw new Error('pet-function is not built. Reinstall the dependency or run npm run build in pet-function.');
}
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
for (const source of files(join(root, 'public'))) {
  const name = relative(join(root, 'public'), source);
  if (name.split(/[\\/]/)[0] === 'games') continue;
  const target = join(host, 'public', name);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}
console.log('[pet-function] resources ready for E-learning from ' + root);
