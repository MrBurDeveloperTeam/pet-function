import test from 'node:test';
import assert from 'node:assert/strict';
import * as shared from '../dist/image-generator.js';

const generation = (overrides = {}) => ({
  id: 'generation-1',
  type: 'image',
  status: 'completed',
  createdAt: '2026-09-22T01:00:00.000Z',
  ...overrides,
});

test('latest pending and processing image/video generations use the active-generation dialogue', () => {
  for (const status of ['pending', 'processing']) {
    for (const type of ['image', 'video']) {
      const result = shared.resolveContentStudioInsight(
        [generation({ status, type })],
        'studio'
      );

      assert.equal(result?.triggerId, 'content_generation_processing');
      assert.equal(result?.facts.status, status);
      assert.equal(result?.message, `Your latest ${type} generation is still processing.`);
      assert.equal(result?.dedupeKey, 'content_generation_processing:generation-1');
    }
  }
});

test('only the latest generation controls dialogue and failed outranks plan', () => {
  const olderFailed = generation({
    id: 'older-failed',
    status: 'failed',
    createdAt: '2026-09-22T01:00:00.000Z',
  });
  const newerCompleted = generation({
    id: 'newer-completed',
    status: 'completed',
    createdAt: '2026-09-22T02:00:00.000Z',
  });

  assert.equal(
    shared.resolveContentStudioInsight([olderFailed, newerCompleted], 'pro')?.triggerId,
    'content_plan_entitlement'
  );

  const latestFailed = shared.resolveContentStudioInsight(
    [newerCompleted, { ...olderFailed, createdAt: '2026-09-22T03:00:00.000Z' }],
    'pro'
  );
  assert.equal(latestFailed?.triggerId, 'content_generation_failed');
  assert.equal(latestFailed?.message, 'Your latest image generation failed.');
});

test('known-empty history may show plan, while unknown generation state stays silent', () => {
  assert.equal(
    shared.resolveContentStudioInsight([], 'free')?.message,
    "You're currently on the Free plan."
  );
  assert.equal(shared.resolveContentStudioInsight(undefined, 'free'), null);
  assert.equal(
    shared.resolveContentStudioInsight([generation({ createdAt: 'invalid' })], 'free'),
    null
  );
  assert.equal(shared.resolveContentStudioInsight([], null), null);
});

test('projection removes private generation fields before dialogue evaluation', () => {
  const projected = shared.projectGenerationsForInsight([
    {
      id: 'private-generation',
      type: 'image',
      mode: 'text-to-image',
      model: 'model',
      prompt: 'PRIVATE PROMPT',
      output_url: 'https://private.example/result.png',
      status: 'failed',
      created_at: '2026-09-22T01:00:00.000Z',
    },
  ]);

  assert.deepEqual(projected, [{
    id: 'private-generation',
    type: 'image',
    status: 'failed',
    createdAt: '2026-09-22T01:00:00.000Z',
  }]);
  assert.doesNotMatch(JSON.stringify(shared.resolveContentStudioInsight(projected, 'free')), /PRIVATE|private\.example/);
});
