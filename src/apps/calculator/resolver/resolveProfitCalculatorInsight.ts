// Deterministic local resolver for Profit Calculator Phase-2B — mirrors
// the same small-module structure already browser-validated in the
// To-Do/Inventory/Appointments/E-Learning/Content Studio repos.
//
// This is intentionally NOT the Gallery global resolver
// (resolveDialogue.ts) and does not import it.
//
// Explicit, hardcoded precedence — never array order:
//   1. profit_latest_saved_plan_not_profitable  (a real, noteworthy
//                                                  negative outcome)
//   2. profit_latest_saved_plan_summary          (informational positive
//                                                  fallback)
//   3. null
// Both operate on the exact SAME deterministically-selected latest plan
// — see ../utils/savedPlanProjection.ts.
//
// READINESS: `selectLatestSavedPlan` can return `'empty'` or `'unknown'`
// (see that file's `LatestSavedPlanSelection` doc comment). Unlike
// Content Studio (where an `'empty'` generation history safely unlocked a
// lower-priority Plan/Entitlement candidate), THIS slice has no
// lower-priority trigger below the plan-outcome pair itself — a "No
// Saved Plans" trigger is explicitly out of scope (CalculatorContext
// cannot currently distinguish "genuinely zero plans" from "still
// loading"/"fetch failed" — see the Phase-2B readiness pass). So both
// `'empty'` and `'unknown'` simply resolve to no candidate here — there
// is nothing to gate a leap over, but the fail-closed principle is
// preserved regardless.
//
// Revenue/Net Profit monetary summary, cost warnings, and any
// current/active-plan-based trigger are deliberately NOT branches here —
// see ../contracts/insightCandidate.ts's `InsightTriggerId` doc.

import {
  evaluateLatestSavedPlanNotProfitable,
  type LatestSavedPlanNotProfitableCandidate,
} from '../providers/latestSavedPlanNotProfitableProvider';
import {
  evaluateLatestSavedPlanSummary,
  type LatestSavedPlanSummaryCandidate,
} from '../providers/latestSavedPlanSummaryProvider';
import { selectLatestSavedPlan, type ProjectedSavedPlan } from '../utils/savedPlanProjection';

// A real discriminated union — each member has its own literal-narrowed
// `triggerId`, so Dashboard.tsx can narrow on
// `candidate.triggerId === '...'` to get the right `candidate.facts`
// shape without an unsafe cast.
export type ProfitCalculatorInsightCandidate =
  | LatestSavedPlanNotProfitableCandidate
  | LatestSavedPlanSummaryCandidate;

export function resolveProfitCalculatorInsight(
  savedPlans: ProjectedSavedPlan[]
): ProfitCalculatorInsightCandidate | null {
  const selection = selectLatestSavedPlan(savedPlans);
  const latest = selection.state === 'selected' ? selection.plan : null;

  const notProfitable = evaluateLatestSavedPlanNotProfitable(latest);
  if (notProfitable) return notProfitable;

  return evaluateLatestSavedPlanSummary(latest);
}
