import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCatWelcomeBack } from '../src/cat/internal/formatWelcomeBack.js';

test('To-do shows a welcome message when there are no undismissed reminders', () => {
  assert.equal(formatCatWelcomeBack(null, 'Nicole Ho'), 'Welcome back, Nicole Ho! 👋');
  assert.equal(formatCatWelcomeBack(' ', null), 'Welcome back! 👋');
  assert.equal(formatCatWelcomeBack('Hi [name]!', 'Nicole Ho'), 'Hi Nicole Ho!');
});
