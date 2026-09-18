// Deterministic dispatcher: approved intent -> pure grounded provider ->
// GroundedDataResult. No Supabase query here — consumes whatever
// CalculatorContext already loaded (existing `state` +
// `getGlobalTotalMonthlyCost()`), passed in by the caller.
//
// OWNERSHIP GATE (checked FIRST, before readiness): `calculatorDataStatus
// === 'ready'` alone is NOT a safe privacy boundary — React can render
// with a new authenticated user before CalculatorContext's `[user?.id]`
// effect has run, so `calculatorDataStatus` may still read `'ready'` for
// one or more renders after the auth user has already changed (a
// leftover from the PREVIOUS user). `calculatorDataUserId` (see
// types.ts's `CalculatorDataOwnerId` doc) identifies which user the
// currently-accepted `state` actually belongs to; this is a read-time
// comparison available immediately, not dependent on any effect having
// executed. If it doesn't match the CURRENT authenticated user (or
// either is null/absent), the request is unavailable — the provider
// (and therefore `getGlobalTotalMonthlyCost()`) is never even called.
//
// READINESS: only after ownership passes, `calculatorDataStatus !==
// 'ready'` short-circuits to `status: 'unavailable'` BEFORE the provider
// runs — unknown calculator state is never reinterpreted as a zero-cost
// answer. `ready` is necessary but NOT sufficient — the provider's own
// integrity gate (checkCalculatorDataIntegrity.ts) additionally
// validates every numeric leaf the formula consumes before trusting its
// result.

import { buildCostSummaryDataFacts } from '../providers/costSummaryDataProvider';
import { buildLatestSavedPlanDataFacts } from '../providers/latestSavedPlanDataProvider';
import { projectSavedPlansForInsight, selectLatestSavedPlan } from '../../utils/savedPlanProjection';
import type {
  ProfitDataIntent,
  GroundedDataResult,
  CalculatorDataStatus,
  CalculatorDataOwnerId,
} from '../contracts/groundedDataResult';
import type { GlobalState, SavedPlan } from '../../types';

export function resolveProfitDataQuery(
  intent: ProfitDataIntent,
  state: GlobalState,
  getGlobalTotalMonthlyCost: () => number,
  calculatorDataStatus: CalculatorDataStatus,
  calculatorDataUserId: CalculatorDataOwnerId,
  currentAuthenticatedUserId: string | null,
  savedPlans: SavedPlan[]
): GroundedDataResult<unknown> {
  const evaluatedAt = new Date().toISOString();

  if (calculatorDataUserId === null || calculatorDataUserId !== currentAuthenticatedUserId) {
    return { status: 'unavailable', intent, reasonCode: 'user_data_not_ready', evaluatedAt };
  }

  if (calculatorDataStatus !== 'ready') {
    return { status: 'unavailable', intent, reasonCode: calculatorDataStatus, evaluatedAt };
  }

  try {
    switch (intent) {
      case 'profit_cost_summary': {
        const evaluation = buildCostSummaryDataFacts(state, getGlobalTotalMonthlyCost);
        if (!evaluation.ok) {
          return { status: 'unavailable', intent, reasonCode: 'evaluation_error', evaluatedAt };
        }
        return { status: 'ok', intent, facts: evaluation.facts, evaluatedAt, sourceRecordIds: [] };
      }
      case 'profit_latest_saved_plan': {
        const selection = selectLatestSavedPlan(projectSavedPlansForInsight(savedPlans));
        const evaluation = buildLatestSavedPlanDataFacts(selection);
        if (!evaluation.ok) {
          return { status: 'unavailable', intent, reasonCode: 'evaluation_error', evaluatedAt };
        }
        return {
          status: 'ok',
          intent,
          facts: evaluation.facts,
          evaluatedAt,
          sourceRecordIds: evaluation.sourceRecordIds,
        };
      }
      default: {
        // Exhaustiveness guard — caught below like any other evaluation
        // failure if ProfitDataIntent is ever widened without updating
        // this switch.
        throw new Error(`Unhandled ProfitDataIntent: ${intent as string}`);
      }
    }
  } catch (err) {
    console.warn('[dataChat] profit data query evaluation failed:', err);
    return { status: 'unavailable', intent, reasonCode: 'evaluation_error', evaluatedAt };
  }
}
