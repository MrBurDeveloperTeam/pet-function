import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const modules = await Promise.all([
  'src/apps/superapp/petDialogue/sessionDedupe.ts',
  'src/cat/internal/refreshDialogueProgress.ts',
].map(async (entryPoint) => {
  const bundled = await build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
  });
  return import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].contents).toString('base64'));
}));
const dedupe = modules.find((module) => 'markDialogueDismissed' in module);
const progress = modules.find((module) => 'markDialogueClosedForRefresh' in module);

function fakeStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('closed reminders persist until Welcome Back resets the round', () => {
  globalThis.sessionStorage = fakeStorage();
  assert.equal(dedupe.isDialogueIneligible('user-a', 'first'), false);
  dedupe.markDialogueDismissed('user-a', 'first');
  assert.equal(dedupe.isDialogueIneligible('user-a', 'first'), true);
  assert.equal(dedupe.isDialogueIneligible('user-a', 'second'), false);
  assert.equal(dedupe.isDialogueIneligible('user-b', 'first'), false);
  dedupe.markDialogueDismissed('user-a', 'second');
  assert.deepEqual([...progress.readClosedDialogueKeys('superapp', 'user-a')], ['first', 'second']);
  dedupe.resetDialogueRound('user-a');
  assert.equal(dedupe.isDialogueIneligible('user-a', 'first'), false);
});

test('shared progress is scoped to app and user and survives a reload', () => {
  globalThis.sessionStorage = fakeStorage();
  progress.markDialogueClosedForRefresh('todo', 'user-a', 'task-1');
  progress.holdDialogueUntilReload('todo', 'user-a');
  assert.equal(progress.readClosedDialogueKeys('todo', 'user-a').has('task-1'), true);
  assert.equal(progress.isDialogueHeldUntilReload('todo', 'user-a'), true);
  assert.equal(progress.isDialogueHeldUntilReload('inventory', 'user-a'), false);
  assert.equal(progress.readClosedDialogueKeys('inventory', 'user-a').has('task-1'), false);
  assert.equal(progress.readClosedDialogueKeys('todo', 'user-b').has('task-1'), false);
  progress.resetDialogueProgress('todo', 'user-a');
  assert.equal(progress.readClosedDialogueKeys('todo', 'user-a').has('task-1'), false);
});
