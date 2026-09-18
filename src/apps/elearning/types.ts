export interface OwnVideoAnalyticsRow { id: string; view_count: number | null; created_at: string }
export interface OwnVideoAnalyticsSnapshot { latest: OwnVideoAnalyticsRow | null; mostViewed: OwnVideoAnalyticsRow | null }
export interface ElearningProfile { user_id?: string; name?: string | null; full_name?: string | null; username?: string | null; avatar_url?: string | null }
export interface NotificationWithActor {
  id: string; actor_id: string; video_id: string | null; created_at: string;
  type: string; is_read: boolean; source?: 'platform' | 'community';
  profiles: ElearningProfile | null;
}
export interface VideoWithCreator {
  id: string; title: string; status: 'published' | 'processing' | 'unlisted' | 'removed';
  view_count: number; created_at: string;
}
