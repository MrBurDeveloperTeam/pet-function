// Pure evaluator over an already-fetched, already-minimized own-video
// analytics snapshot (see ../../lib/queries/videos.ts's
// `fetchOwnVideoAnalyticsSnapshot`). No Supabase query here — this
// function is synchronous and side-effect-free.
//
// V1 PRODUCT SEMANTICS: "latest" means the current user's most recently
// created ELIGIBLE (published + public) owned video — full stop. No
// invented recency window (7/14/30 days). If that video happens to be
// months old, it still qualifies; there is no established product
// threshold for "too old to be worth showing".
//
// Ownership and eligibility (status/visibility) are already enforced by
// the query itself (`creator_id = currentUser`, `status = 'published'`,
// `visibility = 'public'`) — this function never re-derives or re-checks
// creator identity; it only decides whether the already-scoped `latest`
// row clears the view-count bar.
//
// FACT NAMING: `videos.created_at` is the only timestamp this query
// selects — there is no confirmed `published_at` column, so facts never
// call it `publishedAt` (that would overstate what the source actually
// records). Since the message never renders a timestamp and the winning
// row is already fully determined by the query's own ORDER BY (no
// client-side tie-break needs it either), the timestamp is simply not
// carried into facts at all, rather than exposed under a misleading or
// unnecessary name.

import type { OwnVideoAnalyticsRow } from '../types';
import type { InsightCandidate } from '../contracts/insightCandidate';

export interface LatestVideoPerformanceFacts {
  videoId: string;
  viewCount: number;
}

/** See FollowedCreatorPostedCandidate's doc comment
 *  (../providers/followedCreatorPostedProvider.ts) for why this
 *  literal-narrowed `triggerId` override exists. */
export interface LatestVideoPerformanceCandidate
  extends InsightCandidate<LatestVideoPerformanceFacts> {
  triggerId: 'elearning_latest_video_performance';
}

function buildMessage(viewCount: number): string {
  return viewCount === 1
    ? 'Your latest published video has 1 view.'
    : `Your latest published video has ${viewCount} views.`;
}

export function evaluateLatestVideoPerformance(
  latest: OwnVideoAnalyticsRow | null
): LatestVideoPerformanceCandidate | null {
  if (!latest) return null;
  if (!latest.id) return null;

  // view_count is typed non-null in the generated Video type, but the
  // underlying trigger-maintained column is defensively treated as
  // possibly null/non-finite here anyway (see this feature's runtime-type
  // review) — never fabricate a count, never celebrate 0.
  const viewCount = latest.view_count;
  if (!Number.isInteger(viewCount) || (viewCount as number) <= 0) {
    return null;
  }

  const facts: LatestVideoPerformanceFacts = {
    videoId: latest.id,
    viewCount: viewCount as number,
  };

  return {
    app: 'elearning',
    triggerId: 'elearning_latest_video_performance',
    priority: 'INFO',
    facts,
    messageTemplate: 'Your latest published video has {viewCount} views.',
    message: buildMessage(viewCount as number),
    action: { label: 'View Video' },
    dedupeKey: `elearning_latest_video_performance:${latest.id}`,
    sourceRecordId: latest.id,
    evaluatedAt: new Date().toISOString(),
  };
}
