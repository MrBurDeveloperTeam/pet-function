import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export function verifyPublicResources(packageRoot, host) {
  const base = join(packageRoot, 'public/pet-function');
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
  if (!existsSync(base)) throw new Error('Missing shared pet-function resource directory: ' + base);
  for (const source of walk(base)) {
    const target = join(host, 'public/pet-function', relative(base, source));
    if (!existsSync(target) || !readFileSync(source).equals(readFileSync(target))) throw new Error('Missing or mismatched shared resource: ' + target);
  }
}
