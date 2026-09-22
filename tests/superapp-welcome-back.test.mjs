import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await build({
  entryPoints: [resolve(root, 'src/apps/superapp/petDialogue/nameResolution.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { buildSuperappWelcomeBackMessage } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64')
);

test('Superapp welcome back uses the full display name and Appointment-style format', () => {
  assert.equal(
    buildSuperappWelcomeBackMessage({ profileName: 'Nicole Ho', email: 'nicole@example.com' }),
    'Welcome back, Nicole Ho! 👋'
  );
  assert.equal(
    buildSuperappWelcomeBackMessage({ profileFullName: 'Nicole Ho' }),
    'Welcome back, Nicole Ho! 👋'
  );
});

test('Superapp welcome back never displays a raw email address', () => {
  assert.equal(buildSuperappWelcomeBackMessage({ email: 'nicole@example.com' }), 'Welcome back, nicole! 👋');
  assert.equal(buildSuperappWelcomeBackMessage({}), 'Welcome back! 👋');
});
