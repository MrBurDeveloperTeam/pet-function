// Pure evaluator over the already-fetched own-video analytics snapshot's
// `mostViewed` row (see ../hooks/useElearningDataChatSources.ts — no
// Supabase query here). The source query already enforces
// `creator_id=currentUser`, `status='published'`, `visibility='public'`,
// AND `view_count > 0`, with deterministic ordering `view_count DESC,
// created_at DESC, id ASC` (see fetchOwnVideoAnalyticsSnapshot) — this
// function never re-sorts or re-selects a winner; Gemini never does
// either.
//
// KNOWN-ZERO (not unavailable): when analytics is ready and `mostViewed`
// is `null`, that means the creator has zero published+public videos
// with any views yet — a truthful, non-fabricated fact, not "data
// unavailable".
//
// MODEL-SAFE FACTS: `{hasViewedVideo, viewCount?}` — no `videoId`, no
// title (same query-shape-preservation reasoning as
// latestVideoPerformanceDataProvider.ts).

import type { OwnVideoAnalyticsRow } from '../../types';

export interface MostViewedVideoDataFacts {
  hasViewedVideo: boolean;
  /** Present only when `hasViewedVideo` is true — always > 0 (source
   *  query already filters `view_count > 0`). */
  viewCount?: number;
}

export function buildMostViewedVideoDataFacts(
  mostViewed: OwnVideoAnalyticsRow | null
): { facts: MostViewedVideoDataFacts; sourceRecordIds: string[] } {
  if (!mostViewed || !mostViewed.id) {
    return { facts: { hasViewedVideo: false }, sourceRecordIds: [] };
  }

  const viewCount = mostViewed.view_count;
  if (typeof viewCount !== 'number' || !Number.isFinite(viewCount) || viewCount <= 0) {
    // Never fabricate — the source query already guarantees > 0 for a
    // non-null row, so this indicates malformed data, not a real zero.
    throw new Error('Malformed or non-positive view_count for most-viewed video');
  }

  return {
    facts: { hasViewedVideo: true, viewCount },
    sourceRecordIds: [mostViewed.id],
  };
}


