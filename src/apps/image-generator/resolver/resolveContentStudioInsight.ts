// Deterministic local resolver for Content Studio Phase-2B — mirrors the
// same small-module structure already browser-validated in the
// To-Do/Inventory/Appointments/E-Learning repos.
//
// This is intentionally NOT the Gallery global resolver
// (resolveDialogue.ts) and does not import it.
//
// Explicit, hardcoded precedence — never array order:
//   1. content_generation_failed      (a real, actionable failure)
//   2. content_generation_processing  (active, non-urgent operational state)
//   3. content_plan_entitlement       (static plan information)
//   4. null
// Each candidate's own provider independently decides its own
// eligibility — this function only picks the first non-null result.
//
// READINESS — TWO INDEPENDENT layers, both gating Plan the same way:
//
// 1. `generations` is `undefined` when the dashboard's own
//    `recentGenerations` server-side fetch failed (Supabase returns
//    `data: null` on a query error) — genuinely UNKNOWN, distinct from a
//    successfully-fetched empty array (`[]`, a known-empty history). See
//    ../hooks/useContentStudioPersonalizedInsight.ts for how this is
//    derived from the dashboard's own props.
// 2. Even when `generations` is a real (possibly non-empty) array,
//    `selectLatestGeneration` can itself report `{state: 'unknown'}` if
//    every row's `createdAt` is unparseable — see
//    ../utils/generationProjection.ts's `LatestGenerationSelection` doc
//    comment. That is ALSO not the same as a known-empty history: rows
//    exist, but which one (if any) is genuinely "latest" — and therefore
//    whether a higher-priority Failed/Processing state exists — cannot be
//    proven.
// In BOTH cases, a lower-priority Plan candidate must never be shown
// while the higher-priority generation state is unknown. This mirrors the
// same "unknown never leaps over a higher, unresolved tier" rule already
// browser-validated in the E-Learning repo's resolver.
//
// Usage Limit Warning is deliberately NOT a branch here — see
// ../contracts/insightCandidate.ts's `InsightTriggerId` doc for why.

import {
  evaluateLatestGenerationFailed,
  type LatestGenerationFailedCandidate,
} from '../providers/latestGenerationFailedProvider';
import {
  evaluateLatestGenerationProcessing,
  type LatestGenerationProcessingCandidate,
} from '../providers/latestGenerationProcessingProvider';
import {
  evaluatePlanEntitlement,
  type PlanEntitlementCandidate,
} from '../providers/planEntitlementProvider';
import { selectLatestGeneration, type ProjectedGeneration } from '../utils/generationProjection';
import type { RecognizedPlan } from '../utils/profileProjection';

// A real discriminated union — each member has its own literal-narrowed
// `triggerId`, so DashboardClient.tsx can narrow on
// `candidate.triggerId === '...'` to get the right `candidate.facts`
// shape without an unsafe cast.
export type ContentStudioInsightCandidate =
  | LatestGenerationFailedCandidate
  | LatestGenerationProcessingCandidate
  | PlanEntitlementCandidate;

export function resolveContentStudioInsight(
  /** `undefined` = generation state unknown (dashboard's generations
   *  fetch failed). A real array (possibly empty) = known. */
  generations: ProjectedGeneration[] | undefined,
  plan: RecognizedPlan | null
): ContentStudioInsightCandidate | null {
  if (generations === undefined) return null;

  const selection = selectLatestGeneration(generations);
  if (selection.state === 'unknown') return null;

  const latest = selection.state === 'selected' ? selection.generation : null;

  const failed = evaluateLatestGenerationFailed(latest);
  if (failed) return failed;

  const processing = evaluateLatestGenerationProcessing(latest);
  if (processing) return processing;

  return evaluatePlanEntitlement(plan);
}
