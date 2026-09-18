// Deterministic dispatcher: approved intent -> pure grounded provider ->
// GroundedDataResult. No Supabase query here — consumes whatever
// ContentStudioDataChatProvider already published from the Dashboard
// page's existing server-fetched props.
//
// OWNERSHIP GATE (checked FIRST, before either domain's source status):
// a `ready` status alone does not prove the published snapshot belongs
// to the CURRENTLY authenticated user. `snapshot.ownerUserId` (set by
// DashboardClient to the user id its server-fetched props were fetched
// for) must additionally match `currentAuthenticatedUserId` (passed to
// MolarAIFloat from the layout's own `getUser()` call, refreshed on
// every server render). This app has no client-side in-place account
// switching (confirmed in the readiness pass: sign-out is a hard
// cross-origin `window.location.replace`, and no client auth listener
// exists anywhere), so the specific SPA-style stale-window race that
// required Profit Calculator's `requestIdRef` hardening cannot occur
// here in the same way — but the ownership check is still implemented
// as a structural, always-on gate rather than an assumption, matching
// the established project-wide pattern and protecting against any
// future architecture change that would introduce that risk.
//
// INDEPENDENT PER-DOMAIN READINESS: `planStatus` and
// `recentGenerationStatus` are checked ONLY for the intent that actually
// needs them — a failed `generations` query never blocks
// `contentstudio_plan_status`, and a failed `profiles` query never
// blocks `contentstudio_recent_generation`. Neither domain's failure is
// ever converted into a claim about the other, or into a false "known
// empty" for its own domain — see ContentStudioDataChatProvider.tsx's
// own header for the exact risk this closes.

import { buildPlanStatusDataFacts } from '../providers/planStatusDataProvider';
import { buildRecentGenerationDataFacts } from '../providers/recentGenerationDataProvider';
import { buildRecentGenerationsListDataFacts } from '../providers/recentGenerationsListDataProvider';
import type { ContentStudioDataChatSnapshot } from '../../ContentStudioDataChatProvider';
import type { ContentStudioDataIntent, GroundedDataResult } from '../contracts/groundedDataResult';

export function resolveContentStudioDataQuery(
  intent: ContentStudioDataIntent,
  snapshot: ContentStudioDataChatSnapshot,
  currentAuthenticatedUserId: string | null
): GroundedDataResult<unknown> {
  const evaluatedAt = new Date().toISOString();

  if (snapshot.ownerUserId === null || snapshot.ownerUserId !== currentAuthenticatedUserId) {
    return { status: 'unavailable', intent, reasonCode: 'user_data_not_ready', evaluatedAt };
  }

  try {
    switch (intent) {
      case 'contentstudio_plan_status': {
        if (snapshot.planStatus !== 'ready') {
          return { status: 'unavailable', intent, reasonCode: snapshot.planStatus, evaluatedAt };
        }
        const evaluation = buildPlanStatusDataFacts(snapshot.plan);
        if (!evaluation) {
          return { status: 'unavailable', intent, reasonCode: 'evaluation_error', evaluatedAt };
        }
        return { status: 'ok', intent, facts: evaluation.facts, evaluatedAt, sourceRecordIds: evaluation.sourceRecordIds };
      }
      case 'contentstudio_recent_generation': {
        if (snapshot.recentGenerationStatus !== 'ready') {
          return { status: 'unavailable', intent, reasonCode: snapshot.recentGenerationStatus, evaluatedAt };
        }
        const evaluation = buildRecentGenerationDataFacts(snapshot.latestGenerationSelection);
        if (!evaluation.ok) {
          return { status: 'unavailable', intent, reasonCode: 'evaluation_error', evaluatedAt };
        }
        return { status: 'ok', intent, facts: evaluation.facts, evaluatedAt, sourceRecordIds: evaluation.sourceRecordIds };
      }
      case 'contentstudio_recent_generations_list': {
        if (snapshot.recentGenerationStatus !== 'ready') {
          return { status: 'unavailable', intent, reasonCode: snapshot.recentGenerationStatus, evaluatedAt };
        }
        if (snapshot.recentGenerationsList === null) {
          return { status: 'unavailable', intent, reasonCode: 'evaluation_error', evaluatedAt };
        }
        const { facts, sourceRecordIds } = buildRecentGenerationsListDataFacts(snapshot.recentGenerationsList);
        return { status: 'ok', intent, facts, evaluatedAt, sourceRecordIds };
      }
      default: {
        // Exhaustiveness guard — caught below like any other evaluation
        // failure if ContentStudioDataIntent is ever widened without
        // updating this switch.
        throw new Error(`Unhandled ContentStudioDataIntent: ${intent as string}`);
      }
    }
  } catch (err) {
    console.warn('[dataChat] content studio data query evaluation failed:', err);
    return { status: 'unavailable', intent, reasonCode: 'evaluation_error', evaluatedAt };
  }
}
