import {readFileSync} from 'node:fs';
const [pack] = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const limit = 268435456;
if (!pack || !Number.isFinite(pack.size)) throw new Error('Invalid npm pack manifest');
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
