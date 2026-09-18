export interface OwnVideoAnalyticsRow { id: string; view_count: number | null; created_at: string }
export interface OwnVideoAnalyticsSnapshot { latest: OwnVideoAnalyticsRow | null; mostViewed: OwnVideoAnalyticsRow | null }
