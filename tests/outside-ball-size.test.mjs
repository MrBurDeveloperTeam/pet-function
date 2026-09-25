import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ballSource = readFileSync(new URL('../src/pet/internal/components/Ball.tsx', import.meta.url), 'utf8');
const physicsSource = readFileSync(new URL('../src/pet/internal/hooks/useBallPhysics.ts', import.meta.url), 'utf8');

test('Outside ball doubles to 120px with a matching physics radius', () => {
  assert.match(ballSource, /h-\[120px\] w-\[120px\]/);
  assert.match(ballSource, /text-\[120px\]/);
  assert.match(physicsSource, /const radius = 60/);
});
