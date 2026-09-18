// Pure evaluator over already-loaded notification + following state (see
// ../hooks/useElearningDataChatSources.ts — no Supabase query here).
// Reuses Phase-2's own runtime PII-minimization projection
// (`projectNotificationsForFollowedCreatorPosted`,
// ../../utils/notificationProjection.ts) UNCHANGED — same email-free,
// already-resolved `actorDisplayName` boundary.
//
// DIRECT-QA DIFFERENCE FROM PHASE-2 (deliberate): Phase-2's own
// `evaluateFollowedCreatorPosted` (../../providers/
// followedCreatorPostedProvider.ts) selects only the SINGLE most-recent
// qualifying notification (a proactive banner shows one candidate at a
// time). Direct-QA "Did anyone I follow post something new?" must
// enumerate ALL currently-qualifying notifications, not just the winner
// — this file does not modify or call that single-winner provider.
//
// ELIGIBILITY (identical rule to Phase-2's own `isQualifying`, ported
// exactly, not reinterpreted):
//   - type === 'new_video'
//   - isRead === false
//   - videoId present
//   - actorId present
//   - actorId is in the CURRENT followingIds set (re-validated live — an
//     unfollowed actor's still-unread notification does not qualify)
// v1 scope is deliberately unread-only, current-follow-only — never
// broadened to "all-time" history, never narrowed to "newest only"
// without disclosing truncation via count/shownCount.
//
// MODEL-SAFE FACTS: `{count, shownCount, posts:[{createdAt,
// creatorDisplayName?}]}` — `creatorDisplayName` is safe because it is
// already sourced exclusively from the app's own public-safe display
// projection (never raw `profiles`, never email). `notificationId`/
// `actorId`/`videoId` are kept local-only (see sourceRecordIds).
//
// READ-ONLY: this function only reads `notifications`/`following` state
// already in memory — it never calls `markNotificationRead`/
// `useMarkRead()` or any mutation, so evaluating this intent can never
// have the side effect of marking a notification read.

import { projectNotificationsForFollowedCreatorPosted, type ProjectedNotification } from '../../utils/notificationProjection';
import type { NotificationWithActor } from '../../types';

const MAX_LIST_ITEMS = 5;

export interface FollowedCreatorUpdateItemFact {
  createdAt: string;
  /** Omitted (not fabricated) when no real display name was resolvable. */
  creatorDisplayName?: string;
}

export interface FollowedCreatorUpdatesDataFacts {
  count: number;
  shownCount: number;
  posts: FollowedCreatorUpdateItemFact[];
}

function isQualifying(notification: ProjectedNotification, followingIds: Set<string>): boolean {
  if (notification.type !== 'new_video') return false;
  if (notification.isRead !== false) return false;
  if (!notification.videoId) return false;
  if (!notification.actorId) return false;
  return followingIds.has(notification.actorId);
}

/** Deterministic same-type tie-break: most recent `createdAt` first,
 *  then notification id — identical to Phase-2's own tie-break, never
 *  array/object iteration order. */
function compareForOrdering(a: ProjectedNotification, b: ProjectedNotification): number {
  const aMs = Date.parse(a.createdAt);
  const bMs = Date.parse(b.createdAt);
  if (aMs !== bMs) return bMs - aMs;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildFollowedCreatorUpdatesDataFacts(
  rawNotifications: NotificationWithActor[] | undefined,
  followingRows: Array<{ following_id: string }> | undefined
): { facts: FollowedCreatorUpdatesDataFacts; sourceRecordIds: string[] } {
  const projected = projectNotificationsForFollowedCreatorPosted(rawNotifications);
  const followingIds = new Set(
    (followingRows ?? []).map((row) => row.following_id).filter((value): value is string => !!value)
  );

  const qualifying = projected.filter((n) => isQualifying(n, followingIds));
  // Malformed timestamp — cannot order reliably; excluded (mirrors
  // Phase-2's own fail-closed per-row behavior), not counted.
  const withValidDate = qualifying.filter((n) => !Number.isNaN(Date.parse(n.createdAt)));

  const ordered = [...withValidDate].sort(compareForOrdering);
  const shown = ordered.slice(0, MAX_LIST_ITEMS);

  const facts: FollowedCreatorUpdatesDataFacts = {
    count: ordered.length,
    shownCount: shown.length,
    posts: shown.map((n) => ({
      createdAt: n.createdAt,
      ...(n.actorDisplayName ? { creatorDisplayName: n.actorDisplayName } : {}),
    })),
  };

  return { facts, sourceRecordIds: shown.map((n) => n.id) };
}


