// Dialogue-layer-only pool construction for E-Learning's Cat Reminder —
// sits alongside selectDialogueCandidate.ts. Deliberately separate from
// aiExperience/resolver/resolveElearningInsight.ts (the inline
// PersonalizedInsight banner's resolver), which stays completely untouched
// and keeps returning exactly one pure business winner.
//
// Confirmed starvation defect this fixes: resolveElearningInsight.ts
// reduces Followed Creator Posted (the one MULTI_RECORD_FAMILY here — see
// the audit's classification) to ONE winner before Cat's dismissal check
// ever runs. If that winner gets Cat-dismissed but its underlying
// notification is still unread (`notifications.is_read` unchanged — Cat
// dismissal is presentation-only, see sessionDedupe.ts), the next Cat
// activation resolves the exact same winner again, Cat suppresses it
// again, and a second still-unread followed-creator notification is never
// reached — Cat incorrectly falls through to Welcome Back even though a
// second qualifying notification exists.
//
// Fix: build one ORDERED pool for Followed Creator Posted (reusing the
// provider's own existing eligibility/sort/candidate-construction verbatim
// — see evaluateFollowedCreatorPostedCandidates), then append the two
// intentional singletons (Latest Video Performance, Most Viewed Video)
// last, in that same priority order resolveElearningInsight.ts already
// uses, each as a single fallback entry — neither is exploded into a
// ranked list of older/other videos or given any new per-record logic, per
// the audit's own classification (LATEST_SINGLETON /
// RANKED_SINGLETON_BY_PRODUCT_DEFINITION — cycling to the "second latest"
// or "second most viewed" video merely because the current one was
// Cat-dismissed would misrepresent those product concepts, which this task
// explicitly forbids). selectFirstEligibleDialogueCandidate
// (selectDialogueCandidate.ts) then does one linear scan for the first
// not-seen/not-dismissed entry — equivalent to "first eligible candidate
// within Followed Creator Posted, else Latest Video Performance, else Most
// Viewed Video" purely because the pool is concatenated in priority order
// and the scan is a single left-to-right pass.
//
// READINESS PARITY: `ownVideoAnalytics === undefined` (analytics
// loading/errored — see useElearningPersonalizedInsight.ts) is handled
// here exactly as resolveElearningInsight.ts handles it: Followed Creator
// Posted candidates are still returned (a higher-priority, already-known
// family must never be hidden by a slower/failed lower-priority query),
// but Latest Video Performance / Most Viewed Video are never appended
// while analytics is unknown — never fabricated as "no video"/"0 views".
//
// Building this pool is pure/synchronous (same already-loaded
// notifications/followingIds/ownVideoAnalytics the inline banner uses) —
// no new Supabase query, no browser storage read. Only
// selectFirstEligibleDialogueCandidate (called separately, by the caller,
// once a userId is known) touches sessionStorage/localStorage — this file
// never does, and it never reads or writes `notifications.is_read` either.

import { evaluateFollowedCreatorPostedCandidates } from '../providers/followedCreatorPostedProvider';
import { evaluateLatestVideoPerformance } from '../providers/latestVideoPerformanceProvider';
import { evaluateMostViewedVideo } from '../providers/mostViewedVideoProvider';
import type { ElearningInsightCandidate } from '../resolver/resolveElearningInsight';
import type { ProjectedNotification } from '../utils/notificationProjection';
import type { OwnVideoAnalyticsSnapshot } from '../types';

/**
 * Ordered pool of every candidate Cat may legitimately choose from, in
 * exact resolveElearningInsight.ts family priority order: Followed
 * Creator Posted > Latest Video Performance > Most Viewed Video. `pool[0]`
 * (when no suppression is applied) is always identical to
 * `resolveElearningInsight(notifications, followingIds, ownVideoAnalytics)`
 * — same eligibility, same tie-breaks, same candidate construction, just
 * not yet collapsed to one winner.
 */
export function buildElearningDialoguePool(
  notifications: ProjectedNotification[],
  followingIds: Set<string>,
  ownVideoAnalytics: OwnVideoAnalyticsSnapshot | null | undefined
): ElearningInsightCandidate[] {
  const pool: ElearningInsightCandidate[] = [
    ...evaluateFollowedCreatorPostedCandidates(notifications, followingIds),
  ];

  // Mirrors resolveElearningInsight.ts's own ordering exactly: an unknown
  // analytics state must never suppress an already-resolved Followed
  // Creator Posted pool (already appended above), but must also never be
  // treated as "ready, zero qualifying video" — so the two lower-priority
  // singletons are simply not appended while analytics is unknown.
  if (ownVideoAnalytics === undefined) return pool;

  const latestVideoPerformance = evaluateLatestVideoPerformance(ownVideoAnalytics?.latest ?? null);
  if (latestVideoPerformance) pool.push(latestVideoPerformance);

  const mostViewedVideo = evaluateMostViewedVideo(ownVideoAnalytics?.mostViewed ?? null);
  // The latest video can also be the all-time most viewed video. Both
  // labels are true, but showing the same backing video twice after one
  // candidate is dismissed is repetitive rather than a new insight.
  if (mostViewedVideo && mostViewedVideo.sourceRecordId !== latestVideoPerformance?.sourceRecordId) {
    pool.push(mostViewedVideo);
  }

  return pool;
}
