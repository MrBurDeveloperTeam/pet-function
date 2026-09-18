// Pure evaluator — validates, then calls, the EXISTING authoritative
// `getGlobalTotalMonthlyCost()` (context/CalculatorContext.tsx). Does
// NOT reimplement the formula, and does NOT choose between it and the
// two other divergent cost/profit implementations that exist elsewhere
// in this app (ROICalculatorModal's `fixedOpEx`, SmartForecastingModal's
// own pass) — Slice 1 deliberately reuses only the one function already
// shared with the existing legacy General Chat's `aiContext`.
//
// CURRENCY: `currencySymbol` is a free-text, user-editable string (no
// ISO code/locale exists in this app) — passed through as-is, including
// when it is the app's own legitimate default empty string (`''`,
// `INITIAL_STATE.clinicSettings.currencySymbol`). An empty symbol is not
// treated as an integrity failure — the app itself renders with an empty
// symbol today without erroring, and inventing a currency (e.g. assuming
// MYR/USD from locale) would be a much worse failure mode than a
// symbol-less number.
//
// MODEL-SAFE FACTS: `{totalMonthlyCost, currencySymbol}` only — no
// category breakdown, no individual salary/rent/loan/tax-rate/revenue
// figures, no full `GlobalState`.

import { checkCalculatorCostDataIntegrity } from '../utils/checkCalculatorDataIntegrity';
import type { GlobalState } from '../../types';

export interface CostSummaryDataFacts {
  totalMonthlyCost: number;
  currencySymbol: string;
}

export type CostSummaryEvaluation =
  | { ok: true; facts: CostSummaryDataFacts }
  | { ok: false };

export function buildCostSummaryDataFacts(
  state: GlobalState,
  getGlobalTotalMonthlyCost: () => number
): CostSummaryEvaluation {
  if (!checkCalculatorCostDataIntegrity(state)) return { ok: false };

  const totalMonthlyCost = getGlobalTotalMonthlyCost();
  if (typeof totalMonthlyCost !== 'number' || !Number.isFinite(totalMonthlyCost)) {
    // The formula itself only ever combines already-integrity-checked
    // finite inputs with +/-/* /, so this should be unreachable in
    // practice — kept as a defensive final check per the task's explicit
    // instruction to validate the RETURNED result too, not just inputs.
    return { ok: false };
  }

  return {
    ok: true,
    facts: {
      totalMonthlyCost,
      currencySymbol: state.clinicSettings.currencySymbol,
    },
  };
}
