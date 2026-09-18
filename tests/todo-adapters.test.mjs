import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyTodoDataIntent,
  isTaskMutationRequest,
  resolveTodoDataQuery,
  createTodoCapabilityMatcher,
} from '../dist/todo.js';

test('Todo grounded intent routing preserves supported questions and mutation guard', () => {
  assert.deepEqual(classifyTodoDataIntent('show my overdue high priority tasks'), {
    kind: 'matched',
    intent: 'todo_overdue_high',
  });
  assert.deepEqual(classifyTodoDataIntent('show upcoming tasks'), {
    kind: 'matched',
    intent: 'todo_upcoming',
  });
  assert.equal(isTaskMutationRequest('delete my task'), true);
  assert.equal(isTaskMutationRequest('how do I delete a task?'), false);
});

test('Todo data resolution distinguishes loading from a known empty task list', () => {
  const loading = resolveTodoDataQuery('todo_summary', [], 'loading');
  assert.equal(loading.status, 'unavailable');
  assert.equal(loading.reasonCode, 'loading');

  const ready = resolveTodoDataQuery('todo_summary', [], 'ready');
  assert.equal(ready.status, 'ok');
  assert.equal(ready.facts.openTaskCount, 0);
});

test('Todo semantic router rejects unknown capabilities and transport failures', async () => {
  const unknown = createTodoCapabilityMatcher(async () => ({
    route: 'grounded',
    capability: 'unknown-capability',
    confidence: 'high',
    clarification: null,
  }));
  assert.deepEqual(await unknown('question', [], null), { type: 'unavailable' });

  const failed = createTodoCapabilityMatcher(async () => {
    throw new Error('network down');
  });
  assert.deepEqual(await failed('question', [], null), { type: 'unavailable' });
});
