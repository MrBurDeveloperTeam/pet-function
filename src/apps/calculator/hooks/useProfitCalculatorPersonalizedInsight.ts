// Minimal hook wiring the local resolver into React — mirrors the
// browser-validated To-Do/Inventory/Appointments/E-Learning/Content
// Studio pattern, adapted to this repo's own architecture: `savedPlans`
// lives in `CalculatorContext` (a plain React Context, not a server
// component prop or a React Query cache) and is already fetched once at
// app load — this hook calls `useCalculator()` directly rather than
// requiring props, matching how Dashboard.tsx itself already consumes
// the context.
//
// NO NEW SUPABASE QUERY: `useCalculator()` is the exact same context
// instance the rest of the app already uses; this hook issues no
// Supabase call of its own.
//
// DYNAMIC REEVALUATION COMES FOR FREE: `savePlan`/`updatePlan`/
// `deletePlan` (CalculatorContext.tsx) all call plain `setSavedPlans(...)`
// synchronously, so `savedPlans` is a normal React state array — saving a
// new plan, editing an existing one (which rewrites its `date`), or
// deleting the currently-selected one all naturally trigger a re-render
// and this hook's `useMemo` re-derives the candidate from the new array.
// No event bus, no polling, no realtime subscription is added.
//
// LOADING/ERROR LIMITATION: `CalculatorContext` cannot currently
// distinguish "still loading", "fetch failed", and "successfully
// fetched, zero saved plans" — all three render as `savedPlans = []` —
// see ../utils/savedPlanProjection.ts's `LatestSavedPlanSelection` doc
// comment and this feature's implementation report. This hook does not
// attempt to work around that; both candidates require at least one
// selected plan to exist, so the ambiguous empty state naturally yields
// no candidate rather than a false claim.

import { useMemo } from 'react';

import {
  resolveProfitCalculatorInsight,
  type ProfitCalculatorInsightCandidate,
} from '../resolver/resolveProfitCalculatorInsight';
import { projectSavedPlansForInsight } from '../utils/savedPlanProjection';

export function createUseProfitCalculatorPersonalizedInsight(
  useCalculator: () => { savedPlans: import('../types').SavedPlan[] }
) {
return function useProfitCalculatorPersonalizedInsight(): ProfitCalculatorInsightCandidate | null {
  const { savedPlans } = useCalculator();

  return useMemo(() => {
    try {
      const projected = projectSavedPlansForInsight(savedPlans);
      return resolveProfitCalculatorInsight(projected);
    } catch (err) {
      // A provider failure must never produce a fabricated personalized
      // claim or a raw error surfaced to the user. Evaluation here is
      // pure (no network call) — this is only a last-resort guard
      // against a malformed saved-plan row; the safe behavior is simply
      // "no insight this render". Never logs the saved plan objects
      // (name/inputs/results must never reach the console).
      console.warn('[aiExperience] profit calculator personalized insight evaluation failed:', err);
      return null;
    }
  }, [savedPlans]);
}
}
