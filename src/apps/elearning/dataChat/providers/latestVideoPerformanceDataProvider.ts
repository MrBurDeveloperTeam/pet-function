// Pure evaluator over the already-fetched own-video analytics snapshot's
// `latest` row (see ../hooks/useElearningDataChatSources.ts — no
// Supabase query here). Ownership/eligibility (`creator_id=currentUser`,
// `status='published'`, `visibility='public'`) are already enforced by
// the SAME query Phase-2 uses (fetchOwnVideoAnalyticsSnapshot).
//
// DIRECT-QA DIFFERENCE FROM PHASE-2 (deliberate, not a bug): Phase-2's
// own `evaluateLatestVideoPerformance` (../../providers/
// latestVideoPerformanceProvider.ts) additionally requires
// `view_count > 0` — a 0-view latest video is not "noteworthy" enough
// for a proactive banner. Direct-QA has no such worthiness bar: "How is
// my latest video doing?" must truthfully answer "0 views" rather than
// silently reinterpreting that as no video at all. This file does NOT
// modify Phase-2's own provider — it is a separate function with
// separate product semantics.
//
// MODEL-SAFE FACTS: `{hasVideo, viewCount?}` — deliberately no
// `videoId` (no phrasing value) and no `title` (the existing analytics
// query only ever selects `id, view_count, created_at` — adding title
// would require changing that query, which this slice does not do).

import type { OwnVideoAnalyticsRow } from '../../types';

export interface LatestVideoPerformanceDataFacts {
  hasVideo: boolean;
  /** Present only when `hasVideo` is true — may legitimately be 0. */
  viewCount?: number;
}

export function buildLatestVideoPerformanceDataFacts(
  latest: OwnVideoAnalyticsRow | null
): { facts: LatestVideoPerformanceDataFacts; sourceRecordIds: string[] } {
  if (!latest || !latest.id) {
    return { facts: { hasVideo: false }, sourceRecordIds: [] };
  }

  const viewCount = latest.view_count;
  if (typeof viewCount !== 'number' || !Number.isFinite(viewCount) || viewCount < 0) {
    // Never fabricate a count from malformed data — let the caller treat
    // this as an evaluation failure (unavailable), not a guessed 0.
    throw new Error('Malformed view_count for latest video');
  }

  return {
    facts: { hasVideo: true, viewCount },
    sourceRecordIds: [latest.id],
  };
}


