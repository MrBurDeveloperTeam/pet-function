import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await build({
  entryPoints: [resolve(root, 'src/apps/superapp/petDialogue/resolveDialogue.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { resolvePersonalizedDialogue } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64')
);

const candidate = (priority, eventTime = undefined) => ({
  priority,
  eventTime,
  dedupeKey: `${priority}:${eventTime ?? ''}`,
});

test('incomplete profile outranks every urgent main-page candidate', () => {
  const fallback = candidate('FALLBACK');
  const pool = [candidate('P0'), candidate('P1'), candidate('PROFILE'), candidate('P2')];
  assert.equal(resolvePersonalizedDialogue(pool, fallback).priority, 'PROFILE');
});

test('urgent priorities, event time, and fallback remain deterministic', () => {
  const fallback = candidate('FALLBACK');
  assert.equal(resolvePersonalizedDialogue([candidate('P2'), candidate('P1'), candidate('P0')], fallback).priority, 'P0');
  assert.equal(resolvePersonalizedDialogue([candidate('P1', '2026-09-23'), candidate('P1', '2026-09-22')], fallback).eventTime, '2026-09-22');
  assert.equal(resolvePersonalizedDialogue([], fallback), fallback);
});
