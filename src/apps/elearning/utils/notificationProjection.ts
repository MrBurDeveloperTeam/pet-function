export interface ProjectedNotification {
  id: string;
  actorId: string;
  videoId: string | null;
  createdAt: string;
  type: string;
  isRead: boolean;
  /** Already-resolved display string, or `undefined` if no real name
   *  could be resolved from the joined (email-free) actor profile —
   *  never a fabricated placeholder. */
  actorDisplayName?: string;
  /** Which table `markNotificationRead` must target — `fetchNotifications`
   *  always sets this per row; defaulted to `'platform'` (the original
   *  `notifications` table) only as a defensive fallback. */
  source: 'platform' | 'community';
}

import type { NotificationWithActor } from '../types';

export function projectNotificationsForFollowedCreatorPosted(
  notifications: NotificationWithActor[] | undefined
): ProjectedNotification[] {
  if (!Array.isArray(notifications)) return [];
  return notifications.map((row) => {
    const candidates = [row.profiles?.full_name, row.profiles?.username, row.profiles?.name];
    const actorDisplayName = candidates.map((value) => value?.trim()).find(Boolean);
    return {
      id: row.id,
      actorId: row.actor_id,
      videoId: row.video_id,
      createdAt: row.created_at,
      type: row.type,
      isRead: row.is_read,
      source: row.source ?? 'platform',
      ...(actorDisplayName ? { actorDisplayName } : {}),
    };
  });
}
