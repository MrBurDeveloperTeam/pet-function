// Pure evaluator over the caller-selected latest saved plan (see
// ../../utils/savedPlanProjection.ts's `selectLatestSavedPlan`). No
// Supabase query here.
//
// Data-Chat counterpart to the two existing Insight providers
// (../../providers/latestSavedPlanSummaryProvider.ts and
// latestSavedPlanNotProfitableProvider.ts) — this is a QUESTION-ANSWER
// evaluator, not a proactive-banner candidate, so it merges both of those
// providers' `isProfitable: true`/`false` branches into ONE facts shape
// instead of two separate triggerId-narrowed candidates. Same
// HISTORICAL SNAPSHOT SEMANTICS, ONE-PLAN BOUNDARY, and NO-CURRENCY rule
// as both source providers — see their headers for the full rationale
// (currency is a current-global setting, not snapshotted per plan, so no
// monetary value from an old plan is ever read here).

import type { ProjectedSavedPlan, LatestSavedPlanSelection } from '../../utils/savedPlanProjection';
import type { SavedPlan } from '../../types';

export interface LatestSavedPlanDataFacts {
  planId: string;
  timeframe: SavedPlan['timeframe'];
  isProfitable: boolean;
  /** Present only when the persisted count is a valid finite
   *  non-negative number — never fabricated. */
  totalProcedures?: number;
}

function factsFromPlan(plan: ProjectedSavedPlan): LatestSavedPlanDataFacts | null {
  if (typeof plan.isProfitable !== 'boolean') return null;
  const hasValidCount = Number.isFinite(plan.totalProcedures) && plan.totalProcedures >= 0;
  return {
    planId: plan.id,
    timeframe: plan.timeframe,
    isProfitable: plan.isProfitable,
    ...(hasValidCount ? { totalProcedures: plan.totalProcedures } : {}),
  };
}

export function buildLatestSavedPlanDataFacts(
  selection: LatestSavedPlanSelection
): { ok: true; facts: LatestSavedPlanDataFacts; sourceRecordIds: string[] } | { ok: false } {
  if (selection.state !== 'selected') return { ok: false };
  const facts = factsFromPlan(selection.plan);
  if (!facts) return { ok: false };
  return { ok: true, facts, sourceRecordIds: [facts.planId] };
}
