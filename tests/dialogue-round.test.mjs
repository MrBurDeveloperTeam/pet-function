import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundled = await build({
  entryPoints: ['src/apps/superapp/petDialogue/sessionDedupe.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const dedupe = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].contents).toString('base64'));

test('closing a dialogue advances only the current round, then a new round repeats it', () => {
  assert.equal(dedupe.isDialogueIneligible('user-a', 'first'), false);
  dedupe.markDialogueDismissed('user-a', 'first');
  assert.equal(dedupe.isDialogueIneligible('user-a', 'first'), true);
  assert.equal(dedupe.isDialogueIneligible('user-a', 'second'), false);
  assert.equal(dedupe.isDialogueIneligible('user-b', 'first'), false);
  dedupe.resetDialogueRound('user-a');
  assert.equal(dedupe.isDialogueIneligible('user-a', 'first'), false);
});
