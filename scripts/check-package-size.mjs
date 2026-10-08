import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function parsePackOutput(output) {
  const text = output.replace(/^\uFEFF/, '').trim();
  // npm pack can print prepare/build lifecycle output before its JSON result.
  const starts = [...text.matchAll(/^\s*\[/gm)].map(match => match.index);
  for (const start of starts.reverse()) {
    try {
      const result = JSON.parse(text.slice(start));
      if (Array.isArray(result) && result.length === 1 && Array.isArray(result[0]?.files)) return result[0];
    } catch { /* Keep searching for the final complete npm pack result. */ }
  }
  throw new Error('No valid npm pack JSON result found in manifest output');
}
export function checkPackage(pack) {
const limit = 268435456;
if (!pack || !Number.isFinite(pack.size) || pack.size < 0 || !Array.isArray(pack.files)) throw new Error('Invalid npm pack manifest');
if (pack.size > limit) throw new Error(`Package is ${pack.size} bytes; GitHub Packages limit is ${limit}`);
const files = new Set(pack.files.map(file => file.path));
for (const game of ['mole-game','cat-kart','stadium-football','stadium-hurdles','air-strike']) {
  for (const name of ['index.html','index.pck']) {
    if (!files.has(`public/games/${game}/${name}`)) throw new Error(`Missing ${game}/${name}`);
  }
}
for (const name of ['index.js','index.wasm']) {
  if (!files.has(`public/games/mole-game/${name}`)) throw new Error(`Missing shared Godot ${name}`);
}
console.log(`Package verified: ${(pack.size/1e6).toFixed(1)} MB; limit ${(limit/1e6).toFixed(1)} MB`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkPackage(parsePackOutput(readFileSync(process.argv[2], 'utf8')));
}
