import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
const bundled = await build({ entryPoints:['src/pet/runtime/adoptionIdentity.ts'], bundle:true, write:false, platform:'node', format:'esm' });
const { confirmAdoptionIdentity } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
test('Remote choice prevents adoption even without local cache', () => {
  assert.equal(confirmAdoptionIdentity('mochi', null, false), 'mochi');
});
test('Empty remote reads cannot clear an account-confirmed choice', () => {
  for (const remote of [undefined, null, '', ' ']) assert.throws(() => confirmAdoptionIdentity(remote, 'mochi', true));
});
test('Only confirmed empty reads without adoption evidence allow first adoption', () => {
  assert.equal(confirmAdoptionIdentity(null, null, false), null);
  assert.equal(confirmAdoptionIdentity('', 'mallow', false), null);
});
test('Runtime guards guest adoption, duplicate submissions, and expired hydration', () => {
  const runtime = readFileSync('src/pet/runtime/SharedPetRuntime.tsx','utf8');
  assert.ok(runtime.includes('!userId || !isPetAdoptionReady || !isHydrated.current || adoptionInFlight.current'));
  assert.ok(runtime.includes('if (!active) return;'));
  assert.ok(runtime.includes('return () => { active = false; };'));
  assert.ok(readFileSync('src/pet/SharedVirtualPet.tsx','utf8').includes("key={userId ?? 'guest'}"));
});
