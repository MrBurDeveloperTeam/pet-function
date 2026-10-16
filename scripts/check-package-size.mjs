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
const coreBudget = 64 * 1024 * 1024;
if (!pack || !Number.isFinite(pack.size) || pack.size < 0 || !Array.isArray(pack.files)) throw new Error('Invalid npm pack manifest');
if (pack.size > limit) throw new Error(`Package is ${pack.size} bytes; GitHub Packages limit is ${limit}`);
if (pack.size > coreBudget) throw new Error(`Core package exceeds the 64 MiB budget (${pack.size} bytes). Publish large resources as Release assets.`);
const files = new Set(pack.files.map(file => file.path));
for (const name of ['resource-manifest.json','dist/index.js','dist/styles.css','scripts/sync-resource-packs.mjs','scripts/vite-games.mjs']) {
  if (!files.has(name)) throw new Error(`Missing core resource: ${name}`);
}
const coreArt = new Set([
  ...['mallow','silverbelt','fastrat','gulu','munchkin','mochi'].map(cat => `public/pet-function/pets/${cat}-spritesheet.webp`),
  'public/pet-function/ai/ai_logo.png',
  ...['grey_bed','red_bed','purple_bed','poop','shower','soap'].map(name => `public/pet-function/pet/${name}.png`),
]);
for (const path of coreArt) {
  if (!files.has(path)) throw new Error(`Missing core artwork: ${path}`);
}
for (const path of files) {
  if (path.startsWith('public/') && !coreArt.has(path)) throw new Error(`Bulk resource must be a Release asset: ${path}`);
  if (path.startsWith('.resource-packs/')) throw new Error('Release resource packs must not be nested in the npm package');
}
console.log(`Core package verified: ${(pack.size/1048576).toFixed(2)} MiB; budget ${coreBudget/1048576} MiB; registry limit ${limit/1048576} MiB`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkPackage(parsePackOutput(readFileSync(process.argv[2], 'utf8')));
}
