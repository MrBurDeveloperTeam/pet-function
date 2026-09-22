import test from 'node:test';
import assert from 'node:assert/strict';
import { formatInventoryWelcomeBack } from '../src/apps/inventory/petDialogue/inventoryWelcomeBack.js';

test('Inventory falls back to a welcome message after all reminders are dismissed', () => {
  assert.equal(formatInventoryWelcomeBack(null, 'Nicole Ho'), 'Welcome back, Nicole Ho! 👋');
  assert.equal(formatInventoryWelcomeBack('  ', 'Nicole Ho'), 'Welcome back, Nicole Ho! 👋');
  assert.equal(formatInventoryWelcomeBack(null, null), 'Welcome back! 👋');
});

test('Inventory preserves configured welcome text and does not expose email addresses', () => {
  assert.equal(formatInventoryWelcomeBack('Hello again, [name]!', 'Nicole Ho'), 'Hello again, Nicole Ho!');
  assert.equal(formatInventoryWelcomeBack('Hello again!', 'Nicole Ho'), 'Hello again!');
  assert.equal(formatInventoryWelcomeBack(null, 'nicole@example.com'), 'Welcome back, nicole! 👋');
});
