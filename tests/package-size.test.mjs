import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePackOutput,checkPackage} from '../scripts/check-package-size.mjs';
const files = [
  'resource-manifest.json','dist/index.js','dist/styles.css','scripts/sync-resource-packs.mjs','scripts/vite-games.mjs',
  ...['mallow','silverbelt','fastrat','gulu','munchkin','mochi'].map(cat => `public/pet-function/pets/${cat}-spritesheet.webp`),
  'public/pet-function/ai/ai_logo.png',
  ...['grey_bed','red_bed','purple_bed','poop','shower','soap'].map(name => `public/pet-function/pet/${name}.png`),
].map(path => ({path}));
const pack = {size:24*1024*1024,files};
test('reads clean JSON and npm prepare/build logs before final JSON', () => {
  const json = JSON.stringify([pack],null,2);
  assert.deepEqual(parsePackOutput(json),pack);
  assert.deepEqual(parsePackOutput('\uFEFFCLI Building entry: {"apps":"src/apps/index.ts"}\n[postbuild] ready\nDTS Build success\n'+json+'\n'),pack);
});
test('rejects malformed output, oversized packages and missing runtime resources', () => {
  assert.throws(() => parsePackOutput('CLI Building entry: {}\n[not JSON]'),/No valid/);
  assert.throws(() => checkPackage({...pack,size:268435457}),/limit/);
  assert.throws(() => checkPackage({...pack,files:files.filter(f => f.path!=='resource-manifest.json')}),/Missing core/);
  assert.throws(() => checkPackage({...pack,files:files.filter(f => !f.path.endsWith('mallow-spritesheet.webp'))}),/Missing core artwork/);
  assert.throws(() => checkPackage({...pack,size:64*1024*1024+1}),/64 MiB budget/);
  assert.throws(() => checkPackage({...pack,files:[...files,{path:'public/games/new-game/index.pck'}]}),/Release asset/);
  assert.throws(() => checkPackage({...pack,files:[...files,{path:'public/pet-function/new-style/example.webp'}]}),/Release asset/);
  assert.doesNotThrow(() => checkPackage(pack));
});
