// Pure evaluator over the already-projected plan value (see
// ContentStudioDataChatProvider.tsx, which itself calls Phase-2's own
// `projectProfilePlan`). No Supabase query here.
//
// UNKNOWN NEVER BECOMES 'free': `projectProfilePlan` (unchanged,
// Phase-2's own function) already returns `null` for a missing/
// unrecognized raw `profiles.plan` value — it does NOT apply the
// separate `resolveProfile.ts` helper's `resolvePlan()` fallback
// (`AppLayout`'s own profile resolution for the navbar, which defaults
// an invalid/missing plan to `'free'` for display purposes). This
// provider deliberately reuses the Dashboard page's own raw profile
// fetch/projection (already null-preserving) rather than `AppLayout`'s
// defaulting one, specifically so a genuinely-unknown plan never gets
// reported to the user as a false "You're on the Free plan."

import type { RecognizedPlan } from '../../utils/profileProjection';

export interface PlanStatusDataFacts {
  plan: RecognizedPlan;
}

export function buildPlanStatusDataFacts(
  plan: RecognizedPlan | null
): { facts: PlanStatusDataFacts; sourceRecordIds: string[] } | null {
  if (!plan) return null;
  return { facts: { plan }, sourceRecordIds: [] };
}
