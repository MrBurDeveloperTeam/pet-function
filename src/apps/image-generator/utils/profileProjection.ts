// Runtime data-minimization boundary for the dashboard's existing
// `profile` state (`src/app/(app)/dashboard/page.tsx`'s
// `.from("profiles").select("*")`, already loaded — no new Supabase
// query). The full `Profile` row carries `email`, `name`, `avatar_url`,
// `clinic_id`, `phone`, `dob`, `country`, etc. — none of which
// planEntitlementProvider.ts needs. This function extracts only `plan`
// before anything reaches the provider; the full profile object is never
// passed through.
//
// Only the three source-confirmed live values are treated as a
// recognized plan (`Profile['plan']` is the closed TS union
// `'free' | 'pro' | 'studio'`, and `public.profiles.plan` is confirmed
// live as a `text` column defaulting to `'free'` — see the Phase-2B
// reconciliation pass). `null`/`undefined`/anything else is NOT
// normalized to a fabricated default here — see
// planEntitlementProvider.ts for why an unrecognized value simply
// produces no candidate rather than guessing "Free".

import type { Profile } from '../types/profile';

export type RecognizedPlan = 'free' | 'pro' | 'studio';

const RECOGNIZED_PLANS = new Set<string>(['free', 'pro', 'studio']);

function isRecognizedPlan(value: unknown): value is RecognizedPlan {
  return typeof value === 'string' && RECOGNIZED_PLANS.has(value);
}

/** `profile === null` means the profile query itself failed/returned no
 *  row — this returns `null` in that case too, never a fabricated
 *  default plan. */
export function projectProfilePlan(profile: Profile | null): RecognizedPlan | null {
  if (!profile) return null;
  return isRecognizedPlan(profile.plan) ? profile.plan : null;
}
