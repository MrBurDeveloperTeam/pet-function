// Pure evaluator over an already-fetched, already-minimized own-video
// analytics snapshot (see ../../lib/queries/videos.ts's
// `fetchOwnVideoAnalyticsSnapshot`). No Supabase query here.
//
// Acts as a lower-priority analytics fallback behind Latest Video
// Performance (see ../resolver/resolveElearningInsight.ts): if the
// latest eligible video already has qualifying views, THIS candidate is
// simply not selected by the resolver — it is not suppressed here, and it
// remains independently valid (e.g. still usable if a later slice ever
// needs both facts at once). Ownership/eligibility are already enforced
// by the query (`creator_id = currentUser`, `status = 'published'`,
// `visibility = 'public'`, `view_count > 0` — see
// fetchOwnVideoAnalyticsSnapshot's most-viewed branch).
//
// FACT NAMING: same reasoning as latestVideoPerformanceProvider.ts —
// `videos.created_at` is not a confirmed publication timestamp, the
// message never renders one, and the query's own ORDER BY already fully
// determines the winning row, so no timestamp is carried into facts under
// any name.

import type { OwnVideoAnalyticsRow } from '../types';
import type { InsightCandidate } from '../contracts/insightCandidate';

export interface MostViewedVideoFacts {
  videoId: string;
  viewCount: number;
}

/** See FollowedCreatorPostedCandidate's doc comment
 *  (../providers/followedCreatorPostedProvider.ts) for why this
 *  literal-narrowed `triggerId` override exists. */
export interface MostViewedVideoCandidate extends InsightCandidate<MostViewedVideoFacts> {
  triggerId: 'elearning_most_viewed_video';
}

function buildMessage(viewCount: number): string {
  return viewCount === 1
    ? 'Your most viewed video has 1 view.'
    : `Your most viewed video has ${viewCount} views.`;
}

export function evaluateMostViewedVideo(
  mostViewed: OwnVideoAnalyticsRow | null
): MostViewedVideoCandidate | null {
  if (!mostViewed) return null;
  if (!mostViewed.id) return null;

  const viewCount = mostViewed.view_count;
  if (typeof viewCount !== 'number' || !Number.isFinite(viewCount) || viewCount <= 0) {
    return null;
  }

  const facts: MostViewedVideoFacts = {
    videoId: mostViewed.id,
    viewCount,
  };

  return {
    app: 'elearning',
    triggerId: 'elearning_most_viewed_video',
    priority: 'INFO',
    facts,
    messageTemplate: 'Your most viewed video has {viewCount} views.',
    message: buildMessage(viewCount),
    action: { label: 'View Video' },
    dedupeKey: `elearning_most_viewed_video:${mostViewed.id}`,
    sourceRecordId: mostViewed.id,
    evaluatedAt: new Date().toISOString(),
  };
}
