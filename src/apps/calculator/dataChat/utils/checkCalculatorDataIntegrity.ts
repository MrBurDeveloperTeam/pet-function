// Pure, Data-Chat-only integrity gate for `getGlobalTotalMonthlyCost()`
// (context/CalculatorContext.tsx). Does NOT reimplement or approximate
// that formula — it only validates that every numeric leaf the formula
// actually reads is a genuine finite number at runtime, BEFORE the
// formula is trusted for a factual grounded answer.
//
// WHY THIS EXISTS: `GlobalState` numeric fields are typed `number` in
// TypeScript, but two different input components can put non-numeric
// runtime values into them — `StyledInput` (Overhead/Staff/Financial/
// Owner/ClinicSettings) preserves a literal `''` while a field is being
// edited/cleared, with no downstream validation before it reaches
// `CalculatorContext`'s state; `CostInput` (cost-category items)
// collapses blank/NaN/typed-zero to `0` via `parseFloat(...) || 0`
// BEFORE state is ever set — that normalization already happened
// upstream of anything Data Chat can see, and is an ACCEPTED
// PRE-EXISTING PRODUCT LIMITATION for Slice 1 (not fixable here, not a
// gate failure — see the readiness pass; a stored `0` from that path is
// simply treated as an actual current 0, since its original blank/typed
// distinction is already unrecoverable).
//
// EXACT FIELDS VALIDATED — re-derived directly from
// `getGlobalTotalMonthlyCost()`'s current implementation
// (context/CalculatorContext.tsx), not assumed from the readiness pass's
// own tentative list. Fields that function does NOT consume
// (`financial.loanPrincipal`, `owner.riskBufferPercent`,
// `owner.personalTax`, consumables/sterilization/lab/marketing,
// clinicSettings.workingDaysPerWeek/hoursPerDay) are deliberately NOT
// validated here — validating unused fields would fail-closed on data
// that can never affect the answer.
//
// DEPRECIATION DENOMINATOR: the formula itself already guards
// `months > 0 ? (purchasePrice - resaleValue) / months : 0` — a
// non-finite `lifespanYears` would silently make `months > 0` false and
// contribute `0`, which would hide an invalid input as if that asset had
// zero depreciation impact. This gate still requires
// `purchasePrice`/`resaleValue`/`lifespanYears` to individually be finite
// numbers, so that case fails closed here instead of silently vanishing
// into the total.

import type { GlobalState } from '../../types';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function checkCalculatorCostDataIntegrity(state: GlobalState): boolean {
  for (const item of state.overhead.items) {
    if (!isFiniteNumber(item.monthlyCost)) return false;
  }

  for (const member of state.staff.members) {
    if (!isFiniteNumber(member.salary)) return false;
    if (!isFiniteNumber(member.benefits)) return false;
    if (!isFiniteNumber(member.bonus)) return false;
  }

  for (const asset of state.depreciation.assets) {
    if (!isFiniteNumber(asset.purchasePrice)) return false;
    if (!isFiniteNumber(asset.resaleValue)) return false;
    if (!isFiniteNumber(asset.lifespanYears)) return false;
  }

  const { annualApc, annualXray, annualInsurance, monthlyWaste } = state.regulatory;
  if (!isFiniteNumber(annualApc)) return false;
  if (!isFiniteNumber(annualXray)) return false;
  if (!isFiniteNumber(annualInsurance)) return false;
  if (!isFiniteNumber(monthlyWaste)) return false;

  const { monthlyInterest, monthlyBankCharges, transactionFeesPercent, estMonthlyRevenue, taxRate } = state.financial;
  if (!isFiniteNumber(monthlyInterest)) return false;
  if (!isFiniteNumber(monthlyBankCharges)) return false;
  if (!isFiniteNumber(transactionFeesPercent)) return false;
  if (!isFiniteNumber(estMonthlyRevenue)) return false;
  if (!isFiniteNumber(taxRate)) return false;

  if (!isFiniteNumber(state.owner.desiredNetIncome)) return false;

  return true;
}
