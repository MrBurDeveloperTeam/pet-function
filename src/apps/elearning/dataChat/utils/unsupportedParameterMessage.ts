export function buildUnsupportedParameterMessage(reason: 'view_threshold' | 'top_n' | 'date_range'): string {
  if (reason === 'view_threshold') {
    return "I can't filter by a custom view-count threshold in data chat yet. I can check your latest video's performance, your most viewed video, or new updates from creators you follow.";
  }
  if (reason === 'top_n') {
    return "I can't list a custom top-N of videos in data chat yet. I can check your most viewed video specifically.";
  }
  return "I can't filter by a custom date range in data chat yet. I can check your latest video's performance, your most viewed video, or new updates from creators you follow.";
}

export function buildUnsupportedScopeMessage(
  reason: 'creator_summary_deferred' | 'unsupported_metric'
): string {
  if (reason === 'creator_summary_deferred') {
    return "I can currently check your latest-video and most-viewed performance, but not a complete creator summary yet.";
  }
  return "That metric isn't available in data chat yet.";
}

export function buildUnsupportedSensitiveScopeMessage(_reason: 'viewer_identity'): string {
  return "Individual viewer information isn't available through data chat.";
}

/** For a grounded-result `status: 'unavailable'` — `notification_coverage_unknown`
 *  gets its own specific wording (the loaded notification history may be
 *  capped/incomplete, per the coverage contract in
 *  ../contracts/groundedDataResult.ts); every other reason code
 *  (loading/error/not_loaded/evaluation_error) shares one generic
 *  message, since none of them are user-actionable differently. */
export function buildUnavailableMessage(reasonCode: string): string {
  if (reasonCode === 'notification_coverage_unknown') {
    return "I can't reliably check all unread creator updates from the currently loaded notification history.";
  }
  return "I couldn't check that right now.";
}


