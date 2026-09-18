// Pure evaluator over already-loaded, already-projected notification state
// (see ../utils/notificationProjection.ts) and the already-loaded current
// `follows` reverse index (`followingIds`, the same `Set<creatorId>` shape
// Home.tsx itself already derives from `useFollowing`). No Supabase query
// here — this function is synchronous and side-effect-free.
//
// STRICT PRODUCT RULE: a qualifying notification is NOT sufficient on its
// own. `notification.actor_id` must ALSO be present in the CURRENT
// `followingIds` set. An unread `new_video` notification whose actor was
// later unfollowed no longer represents "a creator you follow just posted"
// — the relationship is no longer true — so it must not qualify, even
// though the underlying notification row itself is untouched (still
// unread, still visible in the normal Notifications page). This provider
// never mutates that row; it simply declines to surface it as a
// Followed-Creator-Posted candidate.
//
// Eligibility (ALL required):
//   - type === 'new_video'
//   - isRead === false          (notifications.is_read is the ONLY
//                                  read/dedupe mechanism this slice uses —
//                                  no sessionStorage, no cooldown, no
//                                  second "seen" system)
//   - videoId is present         (needed for the real /watch/$videoId action)
//   - actorId is present
//   - actorId is in the CURRENT followingIds set
//
// No AI, no Gemini, no timestamp-based "freshness window" — `isRead` is
// itself the persistent unseen-state, so no invented recency heuristic is
// needed on top of it.

import type { ProjectedNotification } from '../utils/notificationProjection';
import type { InsightCandidate } from '../contracts/insightCandidate';

export interface FollowedCreatorPostedFacts {
  notificationId: string;
  /** Which table `markNotificationRead` must target for this notification. */
  notificationSource: 'platform' | 'community';
  videoId: string;
  actorId: string;
  /** Present only when a real display name was resolvable from the
   *  joined (email-free) actor profile — never fabricated. */
  actorDisplayName?: string;
  createdAt: string;
}

/** `InsightCandidate<TFacts>`'s `triggerId` field is typed as the FULL
 *  `InsightTriggerId` union (identical on every candidate shape), so it
 *  cannot discriminate a union of `InsightCandidate<...>` variants on its
 *  own — TypeScript needs a literal-narrowed `triggerId` per candidate
 *  shape to let Home.tsx's `if (candidate.triggerId === '...')` actually
 *  narrow `candidate.facts` to the right type. This interface pins that
 *  literal for the resolver's exported union (see
 *  ../resolver/resolveElearningInsight.ts). */
export interface FollowedCreatorPostedCandidate extends InsightCandidate<FollowedCreatorPostedFacts> {
  triggerId: 'elearning_followed_creator_posted';
}

interface QualifyingSource {
  notification: ProjectedNotification;
  createdAtMs: number;
}

function isQualifying(notification: ProjectedNotification, followingIds: Set<string>): boolean {
  if (notification.type !== 'new_video') return false;
  if (notification.isRead !== false) return false;
  if (!notification.videoId) return false;
  if (!notification.actorId) return false;
  return followingIds.has(notification.actorId);
}

/** Deterministic same-type tie-break: most recent `createdAt` first, then
 *  notification id. Never array/object iteration order, never Promise
 *  completion order. */
function compareForSelection(a: QualifyingSource, b: QualifyingSource): number {
  if (a.createdAtMs !== b.createdAtMs) return b.createdAtMs - a.createdAtMs;
  return a.notification.id < b.notification.id ? -1 : a.notification.id > b.notification.id ? 1 : 0;
}

function buildMessage(actorDisplayName: string | undefined): string {
  return actorDisplayName
    ? `${actorDisplayName}, whom you follow, just posted a new video.`
    : 'A creator you follow just posted a new video.';
}

function collectQualifyingSources(notifications: ProjectedNotification[], followingIds: Set<string>): QualifyingSource[] {
  const sources: QualifyingSource[] = [];
  for (const notification of notifications) {
    if (!isQualifying(notification, followingIds)) continue;
    const createdAtMs = Date.parse(notification.createdAt);
    if (Number.isNaN(createdAtMs)) continue; // malformed timestamp — cannot order, exclude
    sources.push({ notification, createdAtMs });
  }
  return sources;
}

function buildCandidateFromSource(source: QualifyingSource): FollowedCreatorPostedCandidate {
  const winner = source.notification;
  // videoId presence already guaranteed by isQualifying above.
  const videoId = winner.videoId as string;
  const message = buildMessage(winner.actorDisplayName);

  const facts: FollowedCreatorPostedFacts = {
    notificationId: winner.id,
    notificationSource: winner.source,
    videoId,
    actorId: winner.actorId,
    ...(winner.actorDisplayName ? { actorDisplayName: winner.actorDisplayName } : {}),
    createdAt: winner.createdAt,
  };

  return {
    app: 'elearning',
    triggerId: 'elearning_followed_creator_posted',
    priority: 'MEDIUM',
    facts,
    messageTemplate: '{actorDisplayName}, whom you follow, just posted a new video.',
    message,
    action: { label: 'Watch video' },
    dedupeKey: `elearning_followed_creator_posted:${winner.id}`,
    sourceRecordId: winner.id,
    evaluatedAt: new Date().toISOString(),
  };
}

export function evaluateFollowedCreatorPosted(
  notifications: ProjectedNotification[],
  followingIds: Set<string>
): FollowedCreatorPostedCandidate | null {
  const sources = collectQualifyingSources(notifications, followingIds);
  if (sources.length === 0) return null;

  const winner = [...sources].sort(compareForSelection)[0]!;
  return buildCandidateFromSource(winner);
}

/**
 * Additive: every independently eligible Followed Creator Posted
 * notification, in the exact same business order compareForSelection
 * already produces — `evaluateFollowedCreatorPostedCandidates(notifications,
 * followingIds)[0]` is always identical to
 * `evaluateFollowedCreatorPosted(notifications, followingIds)`. Used only
 * by the dialogue-layer pool selector (see aiExperience/petDialogue/) so a
 * Cat-dismissed notification can reveal the next still-eligible one
 * instead of the whole family silently disappearing — the inline
 * PersonalizedInsight banner keeps using evaluateFollowedCreatorPosted
 * above, unaffected. `notification.isRead` (the DB column) is the only
 * qualification signal this reuses — dialogue suppression here is purely
 * additive local presentation state, never a substitute for or mutation of
 * that column.
 */
export function evaluateFollowedCreatorPostedCandidates(
  notifications: ProjectedNotification[],
  followingIds: Set<string>
): FollowedCreatorPostedCandidate[] {
  return [...collectQualifyingSources(notifications, followingIds)].sort(compareForSelection).map(buildCandidateFromSource);
}
