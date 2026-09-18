// Pure evaluator over the already-selected latest saved plan (see
// ../utils/savedPlanProjection.ts's `selectLatestSavedPlan`). No Supabase
// query here.
//
// Lower-priority informational counterpart to
// latestSavedPlanNotProfitableProvider.ts — only fires when the SAME
// selected plan's persisted `isProfitable` is exactly `true`; the
// `isProfitable === false` case belongs exclusively to the Not
// Profitable candidate (see resolveProfitCalculatorInsight.ts's
// precedence).
//
// Same historical-snapshot semantics, one-plan boundary, and no-currency
// rule as the Not Profitable provider — see that file's header for the
// full rationale.

import type { ProjectedSavedPlan } from '../utils/savedPlanProjection';
import type { InsightCandidate } from '../contracts/insightCandidate';
import type { SavedPlan } from '../types';

export interface LatestSavedPlanSummaryFacts {
  planId: string;
  timeframe: SavedPlan['timeframe'];
  /** Present only when the persisted count is a valid finite
   *  non-negative number — never fabricated. See `buildMessage` below
   *  for the truthful fallback wording used when it's absent. */
  totalProcedures?: number;
  isProfitable: true;
}

/** See LatestSavedPlanNotProfitableCandidate's doc comment
 *  (../providers/latestSavedPlanNotProfitableProvider.ts) for why this
 *  literal-narrowed `triggerId` override exists. */
export interface LatestSavedPlanSummaryCandidate
  extends InsightCandidate<LatestSavedPlanSummaryFacts> {
  triggerId: 'profit_latest_saved_plan_summary';
}

/**
 * `totalProcedures` is only rendered when it validates as a finite,
 * non-negative number — a malformed/missing count does NOT fail the
 * whole candidate (the persisted `isProfitable` boolean is still valid
 * and worth surfacing), it simply falls back to a shorter, still-truthful
 * sentence that omits the count entirely.
 */
function buildMessage(totalProcedures: number | undefined): string {
  if (totalProcedures === undefined) {
    return 'Your latest saved plan was profitable when saved.';
  }
  const noun = totalProcedures === 1 ? 'procedure' : 'procedures';
  return `Your latest saved plan was profitable when saved and included ${totalProcedures} ${noun}.`;
}

export function evaluateLatestSavedPlanSummary(
  latest: ProjectedSavedPlan | null
): LatestSavedPlanSummaryCandidate | null {
  if (!latest) return null;
  // Strict boolean check — never truthiness.
  if (typeof latest.isProfitable !== 'boolean') return null;
  if (latest.isProfitable !== true) return null;

  const hasValidCount = Number.isFinite(latest.totalProcedures) && latest.totalProcedures >= 0;
  const totalProcedures = hasValidCount ? latest.totalProcedures : undefined;

  const facts: LatestSavedPlanSummaryFacts = {
    planId: latest.id,
    timeframe: latest.timeframe,
    ...(totalProcedures !== undefined ? { totalProcedures } : {}),
    isProfitable: true,
  };

  return {
    app: 'profit-calculator',
    triggerId: 'profit_latest_saved_plan_summary',
    priority: 'INFO',
    facts,
    messageTemplate:
      'Your latest saved plan was profitable when saved and included {totalProcedures} procedures.',
    message: buildMessage(totalProcedures),
    action: { label: 'Open Plan' },
    dedupeKey: `profit_latest_saved_plan_summary:${latest.id}`,
    sourceRecordId: latest.id,
    evaluatedAt: new Date().toISOString(),
  };
}
