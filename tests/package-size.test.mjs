import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePackOutput,checkPackage} from '../scripts/check-package-size.mjs';
const files = ['mole-game','cat-kart','stadium-football','stadium-hurdles','air-strike'].flatMap(game => ['index.html','index.pck'].map(name => ({path:`public/games/${game}/${name}`})));
files.push(...['index.js','index.wasm'].map(name => ({path:`public/games/mole-game/${name}`})));
const pack = {size:262872601,files};
test('reads clean JSON and npm prepare/build logs before final JSON', () => {
  const json = JSON.stringify([pack],null,2);
  assert.deepEqual(parsePackOutput(json),pack);
  assert.deepEqual(parsePackOutput('\uFEFFCLI Building entry: {"apps":"src/apps/index.ts"}\n[postbuild] ready\nDTS Build success\n'+json+'\n'),pack);
});
test('rejects malformed output, oversized packages and missing runtime resources', () => {
  assert.throws(() => parsePackOutput('CLI Building entry: {}\n[not JSON]'),/No valid/);
  assert.throws(() => checkPackage({...pack,size:268435457}),/limit/);
  assert.throws(() => checkPackage({...pack,files:files.filter(f => !f.path.endsWith('.wasm'))}),/Missing shared/);
  assert.doesNotThrow(() => checkPackage(pack));
});
