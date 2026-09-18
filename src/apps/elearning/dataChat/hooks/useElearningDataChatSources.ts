// Reads EXISTING React Query cache entries for Data Chat, WITHOUT ever
// triggering a fetch of its own.
//
// CRITICAL: `enabled: false` on each `useQuery` call below means this
// component's own mount NEVER issues a network request for these keys —
// but it still SUBSCRIBES to and reflects live updates from the shared
// QueryCache entry (React Query dedupes/shares by key across all
// observers regardless of each observer's own `enabled` flag). So if
// Phase-2's `useElearningPersonalizedInsight` (mounted on Home), or
// `useFollowing`/`Feed.tsx`, or `NotificationBell` (mounted via
// `Navbar`/`PageLayout`, likely on most pages) has already populated
// `['own-video-analytics', userId]` / `['notifications', userId]` /
// `['following', userId]`, this hook sees that data for free — zero new
// Supabase reads. If NONE of those happen to be mounted for the current
// page/session, the cache entry has never been populated
// (`dataUpdatedAt === 0`) and this hook reports `not_loaded` rather than
// fetching it itself or treating absence as zero.
//
// SAME QUERY KEYS AS PHASE-2 (verified against
// ../../hooks/useElearningPersonalizedInsight.ts and
// src/hooks/useNotifications.ts / src/hooks/useFollow.ts):
//   ['own-video-analytics', userId]  — fetchOwnVideoAnalyticsSnapshot
//   ['notifications', userId]        — fetchNotifications
//   ['following', userId]            — fetchFollowing
//
// USER-SCOPING: all three keys already include `userId` as their second
// array element (confirmed by reading every call site above) — no
// cross-user cache-key collision is possible. On logout/user switch,
// `userId` becomes `undefined`/a different value, `enabled` conditions
// below naturally key off the new value, and a stale previous user's
// cached data under a DIFFERENT key can never be read as the current
// user's answer.
//
// INTENT-SPECIFIC READINESS: analytics (own-video-analytics) and social
// (notifications + following) are independent sources — an analytics
// error must never block a valid Followed Creator Updates answer, and
// vice versa (mirrors the same principle validated in Appointments'
// Room-Usage-vs-Today-Count integrity independence). `analyticsStatus`
// backs Latest/Most-Viewed; `socialStatus` (combined from BOTH
// notifications and following) backs Followed Creator Updates.

import type { NotificationCoverage, SourceStatus } from '../contracts/groundedDataResult';
import type { ElearningDataChatSources } from '../dataChatSources';
import type { NotificationWithActor } from '../../types';

/** Must match `fetchNotifications`'s own `.limit(30)`
 *  (src/lib/queries/notifications.ts) exactly — this is the only fact
 *  that makes "array length < cap" a valid completeness proof at all. */
const NOTIFICATIONS_QUERY_LIMIT = 30;

/** `notifications.length < 30` is the ONLY locally-provable complete
 *  case — the query didn't hit its cap, so nothing older was cut off.
 *  At exactly 30, older rows may exist beyond what was loaded and there
 *  is no total-count metadata to rule that out — fails closed to
 *  `potentially_truncated` even if, coincidentally, the loaded 30 rows
 *  already contain qualifying entries (the 30th row's exclusion from a
 *  hypothetical 31st position doesn't prove there is no 31st row). */
function deriveNotificationCoverage(notifications: NotificationWithActor[] | undefined): NotificationCoverage {
  return (notifications?.length ?? 0) < NOTIFICATIONS_QUERY_LIMIT ? 'complete' : 'potentially_truncated';
}

interface ReadOnlyQueryLike {
  isFetching: boolean;
  isError: boolean;
  dataUpdatedAt: number;
}

function deriveSourceStatus(query: ReadOnlyQueryLike): SourceStatus {
  if (query.isFetching) return 'loading';
  if (query.isError) return 'error';
  if (query.dataUpdatedAt > 0) return 'ready';
  return 'not_loaded';
}

/** Precedence when combining two independent sub-sources (notifications +
 *  following) into one `socialStatus`: `loading` first (most likely to
 *  self-resolve), then `error` (a definite problem), then `not_loaded`,
 *  else `ready` only when BOTH are ready. Never silently treats one
 *  ready + one not_loaded as ready. */
function combineSourceStatus(a: SourceStatus, b: SourceStatus): SourceStatus {
  if (a === 'loading' || b === 'loading') return 'loading';
  if (a === 'error' || b === 'error') return 'error';
  if (a === 'not_loaded' || b === 'not_loaded') return 'not_loaded';
  return 'ready';
}

export function createUseElearningDataChatSources({ useQuery, useAuthStore, fetchOwnVideoAnalyticsSnapshot, fetchMyVideos, fetchNotifications, fetchFollowing }: any) {
return function useElearningDataChatSources(): ElearningDataChatSources {
  const userId = useAuthStore((state: any) => state.profile?.user_id);

  const analyticsQuery = useQuery({
    queryKey: ['own-video-analytics', userId],
    queryFn: () => fetchOwnVideoAnalyticsSnapshot(userId!),
    enabled: false,
  });

  const notificationsQuery = useQuery({
    queryKey: ['notifications', userId],
    queryFn: () => fetchNotifications(userId!),
    enabled: false,
  });

  const followingQuery = useQuery({
    queryKey: ['following', userId],
    queryFn: () => fetchFollowing(userId!),
    enabled: false,
  });

  const myVideosQuery = useQuery({
    queryKey: ['my-videos', userId],
    queryFn: () => fetchMyVideos(userId!),
    enabled: false,
  });

  if (!userId) {
    return {
      analyticsStatus: 'not_loaded',
      analyticsData: undefined,
      socialStatus: 'not_loaded',
      notificationCoverage: 'potentially_truncated',
      notifications: undefined,
      following: undefined,
      myVideosStatus: 'not_loaded',
      myVideos: undefined,
    };
  }

  return {
    analyticsStatus: deriveSourceStatus(analyticsQuery),
    analyticsData: analyticsQuery.data,
    socialStatus: combineSourceStatus(deriveSourceStatus(notificationsQuery), deriveSourceStatus(followingQuery)),
    notificationCoverage: deriveNotificationCoverage(notificationsQuery.data),
    notifications: notificationsQuery.data,
    following: followingQuery.data,
    myVideosStatus: deriveSourceStatus(myVideosQuery),
    myVideos: myVideosQuery.data,
  };
};
}
