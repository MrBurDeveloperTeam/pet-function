import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/pet/internal/components/LevelIndicator.tsx', import.meta.url),
  'utf8',
);

test('level progress uses a high-contrast teal fill instead of yellow', () => {
  assert.match(source, /fill="#238f83"/);
  assert.match(source, /fill="#6fd1bd"/);
  assert.match(source, /bg-\[#238f83\]/);
  assert.doesNotMatch(source, /fill="#f7b733"/);
  assert.doesNotMatch(source, /bg-amber-400/);
});
