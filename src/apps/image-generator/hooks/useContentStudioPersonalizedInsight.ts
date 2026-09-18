// Minimal hook wiring the local resolver into React — mirrors the
// browser-validated To-Do/Inventory/Appointments/E-Learning pattern, with
// one structural difference: this app's dashboard data (`profile`,
// `recentGenerations`) is fetched server-side in
// `src/app/(app)/dashboard/page.tsx` and passed down as already-resolved
// props — there is no client-side React Query loading state to gate on
// here. This hook is a pure `useMemo` over those props; it issues NO
// Supabase call of its own.
//
// UNKNOWN vs. KNOWN-EMPTY: `page.tsx` destructures only `{ data }` from
// both Supabase calls, discarding `error` — on a query failure, Supabase
// resolves `data: null`. For `recentGenerations` (a plain list query,
// not `.single()`), a successful-but-empty result is `[]`, genuinely
// different from a failed query's `null`. This hook preserves that
// distinction all the way through: `recentGenerations === null` is
// mapped to `undefined` for the resolver ("generation state unknown" —
// see resolveContentStudioInsight.ts), while `[]` is passed through as a
// real, known-empty array. `profile === null` (either no row or a query
// error — the page code can't distinguish the two) maps to a `null`
// plan projection, which simply yields no Plan/Entitlement candidate —
// see ../providers/planEntitlementProvider.ts.
//
// NO NEW SUPABASE QUERY, NO POLLING, NO REALTIME: current-state
// reflection only — the candidate re-derives whenever the dashboard's own
// `profile`/`recentGenerations` props change (i.e. on the next
// navigation/page load), exactly per this slice's scope.

import { useMemo } from 'react';
import type { Profile } from '../types/profile';
import type { Generation } from '../types/generation';
import { resolveContentStudioInsight, type ContentStudioInsightCandidate } from '../resolver/resolveContentStudioInsight';
import { projectGenerationsForInsight } from '../utils/generationProjection';
import { projectProfilePlan } from '../utils/profileProjection';

export function useContentStudioPersonalizedInsight(
  profile: Profile | null,
  recentGenerations: Generation[] | null
): ContentStudioInsightCandidate | null {
  return useMemo(() => {
    try {
      const projectedGenerations =
        recentGenerations === null ? undefined : projectGenerationsForInsight(recentGenerations);
      const plan = projectProfilePlan(profile);
      return resolveContentStudioInsight(projectedGenerations, plan);
    } catch (err) {
      // A provider failure must never produce a fabricated personalized
      // claim or a raw error surfaced to the user. Evaluation here is
      // pure (no network call) — this is only a last-resort guard
      // against a malformed generation/profile row; the safe behavior is
      // simply "no insight this render". Never logs the generation/
      // profile objects (prompt/output_url/email etc. must never reach
      // the console).
      console.warn('[aiExperience] content-studio personalized insight evaluation failed:', err);
      return null;
    }
  }, [profile, recentGenerations]);
}
