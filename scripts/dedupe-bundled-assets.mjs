import {readFileSync, readdirSync, statSync, unlinkSync, writeFileSync} from 'node:fs';
import {join, relative} from 'node:path';

// Keep one physical copy of bundled fallbacks and host-copyable public art.
// Static new URL literals also let host bundlers discover these fallbacks.
export function dedupeBundledAssets(root) {
  const dist = join(root, 'dist');
  const bySize = new Map();
  function walk(dir) {
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else {
        const size = statSync(path).size;
        const candidates = bySize.get(size) || [];
        candidates.push(path);
        bySize.set(size, candidates);
      }
    }
  }
  walk(join(root, 'public/pet-function'));
  const entries = readdirSync(dist).filter(name => name.endsWith('.js'));
  const scripts = new Map(entries.map(name => [name, readFileSync(join(dist, name), 'utf8')]));
  let bytes = 0;
  let files = 0;
  for (const name of readdirSync(dist)) {
    if (!/\.(?:png|webp|svg|jpe?g|gif)$/i.test(name)) continue;
    const data = readFileSync(join(dist, name));
    const same = (bySize.get(data.length) || []).find(path => data.equals(readFileSync(path)));
    if (!same) continue;
    const publicPath = '../public/pet-function/' + relative(join(root, 'public/pet-function'), same).replaceAll('\\', '/');
    const literal = JSON.stringify('./' + name);
    const replacement = `new URL(${JSON.stringify(publicPath)}, import.meta.url).href`;
    let references = 0;
    for (const [entry, source] of scripts) {
      if (!source.includes(literal)) continue;
      scripts.set(entry, source.replaceAll(literal, replacement));
      references++;
    }
    // Leave unrecognized assets alone instead of removing an unknown consumer.
    if (!references) continue;
    unlinkSync(join(dist, name));
    bytes += data.length;
    files++;
  }
  for (const [entry, source] of scripts) writeFileSync(join(dist, entry), source);
  return {files, bytes};
}
