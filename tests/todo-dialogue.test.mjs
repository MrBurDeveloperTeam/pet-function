import test from 'node:test';
import assert from 'node:assert/strict';
import * as shared from '../dist/todo.js';

const now = new Date(2026, 8, 22, 12, 0, 0);
const task = (overrides = {}) => ({
  id: 'task-1',
  type: 'task',
  title: 'Review stock',
  desc: '',
  date: '2026-09-22',
  time: '',
  priority: 'none',
  list: 'personal',
  done: false,
  created: 1,
  ...overrides,
});

test('todo dialogue pool follows overdue-high, high-today, normal-today priority', () => {
  const pool = shared.buildTodoDialoguePool([
    task({ id: 'normal', title: 'Normal', priority: 'low' }),
    task({ id: 'today-high', title: 'Important', priority: 'high', created: 2 }),
    task({ id: 'overdue-high', title: 'Urgent', priority: 'high', date: '2026-09-21', created: 3 }),
  ], now);

  assert.deepEqual(pool.map((candidate) => candidate.triggerId), [
    'todo_overdue_high',
    'todo_high_today',
    'todo_normal_tasks_today',
  ]);
  assert.equal(pool[0].message, 'Your urgent task "Urgent" is overdue.');
  assert.equal(pool[1].message, 'Your important task "Important" is due today.');
  assert.equal(pool[2].message, 'You have 2 tasks scheduled for today.');
});

test('completed items, events and reminders never become task alerts or task counts', () => {
  const pool = shared.buildTodoDialoguePool([
    task({ id: 'done', priority: 'high', date: '2026-09-21', done: true }),
    task({ id: 'event', type: 'event', priority: 'high', date: '2026-09-21' }),
    task({ id: 'reminder', type: 'reminder', priority: 'high' }),
  ], now);

  assert.doesNotMatch(pool.map((candidate) => candidate.triggerId).join(','), /overdue_high|high_today|normal_tasks/);
});

test('all-caught-up is suppressed by any valid unresolved due or overdue item', () => {
  assert.equal(
    shared.evaluateNothingToday([task({ priority: 'low', date: '2026-09-21' })], now),
    null
  );
  assert.equal(
    shared.evaluateNothingToday([task({ type: 'event', date: '2026-09-22' })], now),
    null
  );
  assert.equal(
    shared.evaluateNothingToday([task({ date: '2026-09-23' })], now)?.message,
    "You're all caught up for today."
  );
});

test('invalid dates do not create overdue or today claims', () => {
  for (const date of ['2026-02-30', '2026-9-2', 'not-a-date', '']) {
    const pool = shared.buildTodoDialoguePool([task({ date, priority: 'high' })], now);
    assert.doesNotMatch(pool.map((candidate) => candidate.triggerId).join(','), /overdue_high|high_today|normal_tasks/);
  }
});

test('task titles are sanitized before appearing in dialogue', () => {
  const candidate = shared.evaluateHighTaskToday([
    task({ title: '  Review\n\u200B patient file  ', priority: 'high' }),
  ], now);
  assert.equal(candidate?.message, 'Your important task "Review patient file" is due today.');
});
