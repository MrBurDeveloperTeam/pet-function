// Runtime data-minimization boundary between `CalculatorContext.savedPlans`
// (already loaded app-wide, no new Supabase query) and the AI Experience
// pipeline. A full `SavedPlan` row carries `name` (free-form user-authored
// text), `inputs` (the full procedure-quantity map), and `results.netProfit`
// / `results.revenue` (unsafe to display without a currency snapshot the
// plan doesn't have — see the Phase-2B readiness pass) — none of which
// this slice's providers need or may use. TypeScript structural typing
// does not strip properties at runtime, so a narrower TS type alone would
// not keep those fields out of anything holding a reference to the
// original rows. This module builds brand-new plain objects before
// anything reaches a provider.

import type { SavedPlan } from '../types';

export interface ProjectedSavedPlan {
  id: string;
  date: string;
  timeframe: SavedPlan['timeframe'];
  isProfitable: boolean;
  totalProcedures: number;
}

export function projectSavedPlansForInsight(savedPlans: SavedPlan[]): ProjectedSavedPlan[] {
  return savedPlans.map((plan) => ({
    id: plan.id,
    date: plan.date,
    timeframe: plan.timeframe,
    isProfitable: plan.results.isProfitable,
    totalProcedures: plan.results.totalProcedures,
  }));
}

/**
 * Result of `selectLatestSavedPlan` — a real tri-state, matching the same
 * pattern already browser-validated in the Content Studio repo's
 * generation-selection logic:
 *
 *   - `'empty'`: `savedPlans` itself has zero rows. NOTE: because
 *     `CalculatorContext` currently cannot distinguish "still loading",
 *     "fetch failed", and "genuinely zero saved plans" (all three render
 *     as `savedPlans = []` — see this feature's implementation report),
 *     `'empty'` here does NOT unlock a lower-priority fallback the way it
 *     safely did in Content Studio (where there was no lower tier below
 *     Plan/Entitlement to gate). For THIS slice there is nothing below
 *     Latest Saved Plan Summary, so `'empty'` and `'unknown'` both simply
 *     result in no candidate — see resolveProfitCalculatorInsight.ts.
 *   - `'unknown'`: `savedPlans` has rows, but NONE of them have a valid,
 *     parseable `date` — which one (if any) is genuinely "latest" cannot
 *     be determined.
 *   - `'selected'`: at least one row has a valid date; the winner is
 *     chosen only from that valid subset.
 */
export type LatestSavedPlanSelection =
  | { state: 'empty' }
  | { state: 'unknown' }
  | { state: 'selected'; plan: ProjectedSavedPlan };

/**
 * Deterministic "latest saved plan" selection. Business ordering is by
 * `SavedPlan.date` — NOT the database's `created_at` — because `date` is
 * rewritten to `new Date().toISOString()` on every save AND every edit
 * (see `ROICalculatorModal.tsx`/`SmartForecastingModal.tsx`'s identical
 * `handleSaveConfirm` pattern), so it genuinely represents "most recently
 * created or updated," matching the exact convention `HistoryTab.tsx`
 * itself already uses for its own list ordering.
 *
 * A malformed/unparseable `date` row is EXCLUDED from the candidate pool
 * before ordering/tie-break ever runs — it can never win the "latest"
 * spot over a row with a real date, and if every row is malformed, this
 * returns `{state: 'unknown'}` rather than letting an id-based tie-break
 * among invalid rows fabricate a fake winner.
 *
 * Tie-break for exactly-equal dates: `id ASC`, stable and deterministic
 * across reloads — never array insertion order.
 */
export function selectLatestSavedPlan(plans: ProjectedSavedPlan[]): LatestSavedPlanSelection {
  if (plans.length === 0) return { state: 'empty' };

  const valid = plans
    .map((plan) => ({ plan, ms: Date.parse(plan.date) }))
    .filter((entry): entry is { plan: ProjectedSavedPlan; ms: number } => Number.isFinite(entry.ms));

  if (valid.length === 0) return { state: 'unknown' };

  valid.sort((a, b) => {
    if (a.ms !== b.ms) return b.ms - a.ms;
    return a.plan.id < b.plan.id ? -1 : a.plan.id > b.plan.id ? 1 : 0;
  });

  return { state: 'selected', plan: valid[0]!.plan };
}
