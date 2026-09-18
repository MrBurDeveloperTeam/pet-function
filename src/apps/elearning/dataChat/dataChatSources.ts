import type { NotificationCoverage, SourceStatus } from './contracts/groundedDataResult';
import type { NotificationWithActor, OwnVideoAnalyticsSnapshot, VideoWithCreator } from '../types';

export interface ElearningDataChatSources {
  analyticsStatus: SourceStatus;
  analyticsData: OwnVideoAnalyticsSnapshot | undefined;
  socialStatus: SourceStatus;
  notificationCoverage: NotificationCoverage;
  notifications: NotificationWithActor[] | undefined;
  following: Array<{ following_id: string }> | undefined;
  myVideosStatus: SourceStatus;
  myVideos: VideoWithCreator[] | undefined;
}

