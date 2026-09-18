export function buildUnsupportedParameterMessage(reason: 'date_range' | 'threshold'): string {
  if (reason === 'date_range') {
    return "I can't filter by a specific date range in data chat yet. I can check your current plan or your most recent generation.";
  }
  return "I can't filter by a custom threshold or top-N in data chat yet. I can check your current plan or your most recent generation.";
}

export function buildUnsupportedScopeMessage(
  reason: 'usage_unavailable' | 'generation_count_unavailable' | 'unsupported_metric'
): string {
  if (reason === 'usage_unavailable') {
    return "Usage/credit information isn't available through data chat yet.";
  }
  if (reason === 'generation_count_unavailable') {
    return "I can't give exhaustive generation counts in data chat yet. I can check your most recent generation.";
  }
  return "That metric isn't available in data chat yet.";
}

/** One generic message for every `reasonCode` (`not_loaded`/`error`/
 *  `user_data_not_ready`/`evaluation_error`) — never reveals WHY (e.g.
 *  never implies a query failed vs. data belonging to a different user,
 *  never surfaces Supabase error text/table names/user IDs). */
export function buildUnavailableMessage(_reasonCode: string): string {
  return "Your Content Studio data isn't available right now.";
}
