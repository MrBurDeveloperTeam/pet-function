import test from 'node:test';
import assert from 'node:assert/strict';
import * as shared from '../dist/elearning.js';

const notification = (overrides = {}) => ({
  id: 'notification-1',
  actorId: 'creator-1',
  videoId: 'video-new',
  createdAt: '2026-09-22T02:00:00.000Z',
  type: 'new_video',
  isRead: false,
  actorDisplayName: 'Creator One',
  source: 'platform',
  ...overrides,
});

test('unread post from a currently followed creator outranks video analytics', () => {
  const pool = shared.buildElearningDialoguePool(
    [notification()],
    new Set(['creator-1']),
    {
      latest: { id: 'latest-video', view_count: 2, created_at: '2026-09-22T01:00:00.000Z' },
      mostViewed: { id: 'top-video', view_count: 9, created_at: '2026-09-20T01:00:00.000Z' },
    }
  );

  assert.deepEqual(pool.map((candidate) => candidate.triggerId), [
    'elearning_followed_creator_posted',
    'elearning_latest_video_performance',
    'elearning_most_viewed_video',
  ]);
  assert.equal(pool[0].message, 'Creator One, whom you follow, just posted a new video.');
});

test('read, unfollowed, malformed and non-video notifications do not qualify', () => {
  const variants = [
    notification({ isRead: true }),
    notification({ actorId: 'not-followed' }),
    notification({ videoId: null }),
    notification({ type: 'new_comment' }),
    notification({ createdAt: 'invalid' }),
  ];
  assert.equal(shared.evaluateFollowedCreatorPosted(variants, new Set(['creator-1'])), null);
});

test('creator display names are sanitized and malformed notification rows do not poison projection', () => {
  const projected = shared.projectNotificationsForFollowedCreatorPosted([
    null,
    {
      id: 'notification-safe',
      actor_id: 'creator-1',
      video_id: 'video-1',
      created_at: '2026-09-22T02:00:00.000Z',
      type: 'new_video',
      is_read: false,
      profiles: { full_name: '  Creator\n\u200B One  ' },
    },
  ]);

  assert.equal(projected.length, 1);
  assert.equal(projected[0].actorDisplayName, 'Creator One');
  assert.equal(
    shared.evaluateFollowedCreatorPosted(projected, new Set(['creator-1']))?.message,
    'Creator One, whom you follow, just posted a new video.'
  );
});

test('view-count dialogue handles singular/plural and rejects invalid counts', () => {
  assert.equal(
    shared.evaluateLatestVideoPerformance({ id: 'v1', view_count: 1, created_at: '2026-09-22' })?.message,
    'Your latest published video has 1 view.'
  );
  assert.equal(
    shared.evaluateMostViewedVideo({ id: 'v2', view_count: 12, created_at: '2026-09-22' })?.message,
    'Your most viewed video has 12 views.'
  );
  for (const view_count of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, null]) {
    assert.equal(shared.evaluateLatestVideoPerformance({ id: 'bad', view_count, created_at: '2026-09-22' }), null);
    assert.equal(shared.evaluateMostViewedVideo({ id: 'bad', view_count, created_at: '2026-09-22' }), null);
  }
});

test('the same video is not shown twice as latest and most viewed', () => {
  const pool = shared.buildElearningDialoguePool([], new Set(), {
    latest: { id: 'same-video', view_count: 15, created_at: '2026-09-22T02:00:00.000Z' },
    mostViewed: { id: 'same-video', view_count: 15, created_at: '2026-09-22T02:00:00.000Z' },
  });
  assert.deepEqual(pool.map((candidate) => candidate.triggerId), ['elearning_latest_video_performance']);
});

test('unknown analytics stays silent without hiding a known social candidate', () => {
  assert.deepEqual(shared.buildElearningDialoguePool([], new Set(), undefined), []);
  assert.equal(
    shared.buildElearningDialoguePool([notification()], new Set(['creator-1']), undefined)[0]?.triggerId,
    'elearning_followed_creator_posted'
  );
});
