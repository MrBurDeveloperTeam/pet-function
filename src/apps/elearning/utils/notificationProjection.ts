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
