// Deterministic dispatcher: approved intent -> pure grounded provider ->
// GroundedDataResult. No Supabase query here — consumes whatever
// ../hooks/useElearningDataChatSources.ts already read from the existing
// React Query cache.
//
// INTENT-SPECIFIC READINESS: Latest/Most-Viewed depend on
// `analyticsStatus`; Followed Creator Updates depends on `socialStatus`
// (combined notifications+following). Neither source's readiness blocks
// the other's intents — an analytics error never blocks a valid social
// answer and vice versa.
//
// NOTIFICATION COVERAGE GATE (Followed Creator Updates only):
// `socialStatus === 'ready'` only means the fetch succeeded — it says
// nothing about whether the loaded (capped at 30) notification array is
// the COMPLETE universe of the recipient's notifications. An exhaustive
// count/zero claim additionally requires
// `sources.notificationCoverage === 'complete'` (see
// ../hooks/useElearningDataChatSources.ts). When coverage is
// `potentially_truncated`, this fails closed to `unavailable` BEFORE the
// provider ever runs — zero Gemini, and critically never a fabricated
// zero or an undercounted total, even if qualifying rows are visible
// within the loaded set.

import { buildLatestVideoPerformanceDataFacts } from '../providers/latestVideoPerformanceDataProvider';
import { buildMostViewedVideoDataFacts } from '../providers/mostViewedVideoDataProvider';
import { buildFollowedCreatorUpdatesDataFacts } from '../providers/followedCreatorUpdatesDataProvider';
import { buildGeneralVideoListDataFacts } from '../providers/generalVideoListDataProvider';
import type { ElearningDataChatSources } from '../dataChatSources';
import type { ElearningDataIntent, GroundedDataResult } from '../contracts/groundedDataResult';

export function resolveElearningDataQuery(
  intent: ElearningDataIntent,
  sources: ElearningDataChatSources
): GroundedDataResult<unknown> {
  const evaluatedAt = new Date().toISOString();

  if (intent === 'elearning_general_video_list') {
    if (sources.myVideosStatus !== 'ready') {
      return { status: 'unavailable', intent, reasonCode: sources.myVideosStatus, evaluatedAt };
    }
    try {
      const { facts, sourceRecordIds } = buildGeneralVideoListDataFacts(sources.myVideos);
      return { status: 'ok', intent, facts, evaluatedAt, sourceRecordIds };
    } catch (err) {
      console.warn('[dataChat] elearning general-video-list evaluation failed:', err);
      return { status: 'unavailable', intent, reasonCode: 'evaluation_error', evaluatedAt };
    }
  }

  if (intent === 'elearning_followed_creator_updates') {
    if (sources.socialStatus !== 'ready') {
      return { status: 'unavailable', intent, reasonCode: sources.socialStatus, evaluatedAt };
    }
    if (sources.notificationCoverage !== 'complete') {
      return { status: 'unavailable', intent, reasonCode: 'notification_coverage_unknown', evaluatedAt };
    }
    try {
      const { facts, sourceRecordIds } = buildFollowedCreatorUpdatesDataFacts(
        sources.notifications,
        sources.following
      );
      return { status: 'ok', intent, facts, evaluatedAt, sourceRecordIds };
    } catch (err) {
      console.warn('[dataChat] elearning followed-creator-updates evaluation failed:', err);
      return { status: 'unavailable', intent, reasonCode: 'evaluation_error', evaluatedAt };
    }
  }

  // Latest / Most Viewed — both backed by analyticsStatus.
  if (sources.analyticsStatus !== 'ready') {
    return { status: 'unavailable', intent, reasonCode: sources.analyticsStatus, evaluatedAt };
  }

  try {
    switch (intent) {
      case 'elearning_latest_video_performance': {
        const { facts, sourceRecordIds } = buildLatestVideoPerformanceDataFacts(
          sources.analyticsData?.latest ?? null
        );
        return { status: 'ok', intent, facts, evaluatedAt, sourceRecordIds };
      }
      case 'elearning_most_viewed_video': {
        const { facts, sourceRecordIds } = buildMostViewedVideoDataFacts(sources.analyticsData?.mostViewed ?? null);
        return { status: 'ok', intent, facts, evaluatedAt, sourceRecordIds };
      }
      default: {
        // Exhaustiveness guard — caught below like any other evaluation
        // failure if ElearningDataIntent is ever widened without
        // updating this switch.
        throw new Error(`Unhandled ElearningDataIntent: ${intent as string}`);
      }
    }
  } catch (err) {
    console.warn('[dataChat] elearning data query evaluation failed:', err);
    return { status: 'unavailable', intent, reasonCode: 'evaluation_error', evaluatedAt };
  }
}

