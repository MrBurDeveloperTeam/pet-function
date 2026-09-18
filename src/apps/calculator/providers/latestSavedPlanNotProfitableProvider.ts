// Pure evaluator over the already-selected latest saved plan (see
// ../utils/savedPlanProjection.ts's `selectLatestSavedPlan`). No Supabase
// query here — this function is synchronous and side-effect-free.
//
// HISTORICAL SNAPSHOT SEMANTICS: `isProfitable`/`totalProcedures` are a
// persisted snapshot from the moment this plan was saved — NOT the
// clinic's current financial outcome. Wording deliberately says "was not
// profitable when saved," never "is not profitable" or "currently" (the
// plan is not recomputed now), and always refers to "your latest saved
// plan," never "your clinic."
//
// ONE-PLAN BOUNDARY: every fact below comes from the exact same selected
// `ProjectedSavedPlan` row — nothing is combined from another plan or
// from current global cost configuration.
//
// NO CURRENCY, NO MONETARY VALUES: `results.netProfit`/`results.revenue`
// are never read here — currency is a current-global setting, not
// snapshotted per plan (see the Phase-2B readiness pass), so a dollar
// amount from an old plan could misrepresent history if the clinic's
// currency changed since. Not part of this slice at all.

import type { ProjectedSavedPlan } from '../utils/savedPlanProjection';
import type { InsightCandidate } from '../contracts/insightCandidate';
import type { SavedPlan } from '../types';

export interface LatestSavedPlanNotProfitableFacts {
  planId: string;
  timeframe: SavedPlan['timeframe'];
  /** Present only when the persisted count is a valid finite
   *  non-negative number — never fabricated. Not used in this trigger's
   *  wording (see message below) but retained for traceability, matching
   *  the summary trigger's fact shape. */
  totalProcedures?: number;
  isProfitable: false;
}

/** See LatestGenerationFailedCandidate's doc comment pattern (established
 *  in the Content Studio repo's aiExperience/providers) for why a
 *  literal-narrowed `triggerId` override is used on every candidate
 *  shape — it's what lets Dashboard.tsx narrow on
 *  `candidate.triggerId === '...'` to get the right `candidate.facts`
 *  shape without an unsafe cast. */
export interface LatestSavedPlanNotProfitableCandidate
  extends InsightCandidate<LatestSavedPlanNotProfitableFacts> {
  triggerId: 'profit_latest_saved_plan_not_profitable';
}

const MESSAGE = 'Your latest saved plan was not profitable when saved.';

export function evaluateLatestSavedPlanNotProfitable(
  latest: ProjectedSavedPlan | null
): LatestSavedPlanNotProfitableCandidate | null {
  if (!latest) return null;
  // Strict boolean check — never truthiness — a non-boolean runtime value
  // (corrupted row) fails closed to no candidate rather than being coerced.
  if (typeof latest.isProfitable !== 'boolean') return null;
  if (latest.isProfitable !== false) return null;

  const hasValidCount = Number.isFinite(latest.totalProcedures) && latest.totalProcedures >= 0;

  const facts: LatestSavedPlanNotProfitableFacts = {
    planId: latest.id,
    timeframe: latest.timeframe,
    ...(hasValidCount ? { totalProcedures: latest.totalProcedures } : {}),
    isProfitable: false,
  };

  return {
    app: 'profit-calculator',
    triggerId: 'profit_latest_saved_plan_not_profitable',
    priority: 'MEDIUM',
    facts,
    messageTemplate: 'Your latest saved plan was not profitable when saved.',
    message: MESSAGE,
    // Action metadata is intentionally just `label` — the real plan
    // object is resolved from current `savedPlans` at the UI boundary
    // using `facts.planId` (see Dashboard.tsx), never carried through
    // the provider/candidate itself.
    action: { label: 'Open Plan' },
    dedupeKey: `profit_latest_saved_plan_not_profitable:${latest.id}`,
    sourceRecordId: latest.id,
    evaluatedAt: new Date().toISOString(),
  };
}
