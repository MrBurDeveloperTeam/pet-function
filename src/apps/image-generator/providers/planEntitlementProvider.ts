// Pure evaluator over the already-projected plan value (see
// ../utils/profileProjection.ts). No Supabase query here.
//
// STRICT SCOPE: this is a purely static, factual "which plan are you on"
// statement. It deliberately says NOTHING about remaining usage, daily
// limits, or quotas — `public.usage_quotas` does not exist in the live
// Supabase project, has no write/increment path anywhere in this repo,
// and no generation endpoint enforces the `PlanLimits` UI constants (see
// the Phase-2B reconciliation pass). Any wording implying an enforced
// entitlement ("X of Y remaining", "daily limit") would misrepresent
// what current production actually guarantees — this provider never
// produces that wording, and `PlanLimits` is not imported here at all.

import type { RecognizedPlan } from '../utils/profileProjection';
import type { InsightCandidate } from '../contracts/insightCandidate';

export interface PlanEntitlementFacts {
  plan: RecognizedPlan;
}

/** See LatestGenerationFailedCandidate's doc comment
 *  (../providers/latestGenerationFailedProvider.ts) for why this
 *  literal-narrowed `triggerId` override exists. */
export interface PlanEntitlementCandidate extends InsightCandidate<PlanEntitlementFacts> {
  triggerId: 'content_plan_entitlement';
}

const PLAN_LABEL: Record<RecognizedPlan, string> = {
  free: 'Free',
  pro: 'Pro',
  studio: 'Studio',
};

export function evaluatePlanEntitlement(plan: RecognizedPlan | null): PlanEntitlementCandidate | null {
  if (!plan) return null;

  const facts: PlanEntitlementFacts = { plan };

  return {
    app: 'content-studio',
    triggerId: 'content_plan_entitlement',
    priority: 'INFO',
    facts,
    messageTemplate: "You're currently on the {plan} plan.",
    message: `You're currently on the ${PLAN_LABEL[plan]} plan.`,
    // No action: `/profile` lands on the default Profile tab, not the
    // Account tab where "Current Plan" actually lives (ProfileClient.tsx
    // has no URL-param tab deep-link) — a "View Plan" action pointing
    // there would not actually land on the information it names. Rather
    // than inventing an unread `?tab=account` param or a fake deep-link
    // just to have an action, this candidate is message-only for this
    // slice.
    dedupeKey: `content_plan_entitlement:${plan}`,
    // No single backing record — this is a static reflection of the
    // profile's own `plan` field, not tied to one generation/row.
    sourceRecordId: null,
    evaluatedAt: new Date().toISOString(),
  };
}
