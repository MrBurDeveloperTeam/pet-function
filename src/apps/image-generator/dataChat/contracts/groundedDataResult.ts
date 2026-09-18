// Content Studio Phase-3 Data-Driven Chat contract — deliberately
// separate from ../../contracts/insightCandidate.ts (Phase-2's
// proactive-banner contract). Direct-QA semantics differ: a grounded
// answer is chosen by the user's own question, not a resolver picking
// one winning proactive candidate.
//
// Slice 1 supports exactly TWO intents — `contentstudio_plan_status` and
// `contentstudio_recent_generation` — per the readiness pass's finding
// that usage/token data has no live source (`usage_quotas` does not
// exist in the live Supabase project) and generation status/failure
// COUNTS cannot be answered exhaustively from the Dashboard's 8-row-
// capped query. Do not widen this union without new source evidence.

export type ContentStudioDataIntent =
  | 'contentstudio_plan_status'
  | 'contentstudio_recent_generation'
  | 'contentstudio_recent_generations_list';

export type GroundedDataResult<TFacts> =
  | {
      status: 'ok';
      intent: ContentStudioDataIntent;
      /** Model-safe structured facts only — never the full `Profile`/
       *  `Generation` row, never a raw prompt or output URL. */
      facts: TFacts;
      evaluatedAt: string;
      /** Local-only ids (never sent to Gemini) — used for traceability. */
      sourceRecordIds: string[];
    }
  | {
      status: 'unavailable';
      intent: ContentStudioDataIntent;
      reasonCode: ContentStudioSourceStatus | 'evaluation_error' | 'user_data_not_ready';
      evaluatedAt: string;
    };

/**
 * Readiness of ONE domain (plan OR recent-generation) within the
 * Dashboard-page-published Data Chat source (see
 * ../../ContentStudioDataChatProvider.tsx). The
 * snapshot tracks `planStatus`/`recentGenerationStatus` SEPARATELY —
 * `profile` and `recentGenerations` are two independent Supabase reads
 * in dashboard/page.tsx that can fail independently, and a failure in
 * one must never affect the other's answerability or be reinterpreted
 * as a known-empty result for either.
 *
 * - `not_loaded`: the Dashboard route has not published a snapshot this
 *   session (e.g. the user hasn't visited /dashboard yet, or has
 *   navigated away — the provider clears itself on unmount). Genuinely
 *   unknown, never treated as empty/zero.
 * - `ready`: the underlying Supabase query succeeded (its `error` field
 *   was falsy). For recent-generation, a successful query returning zero
 *   rows is `ready` — that IS the known-empty case. For plan, `ready`
 *   does NOT by itself guarantee `plan` is a recognized value — see
 *   planStatusDataProvider.ts's own validation.
 * - `error`: the underlying Supabase query itself failed (its `error`
 *   field was truthy). Never converted to `[]`/empty for grounding
 *   purposes, even though the existing Dashboard UI falls back to `[]`
 *   for display convenience elsewhere — see
 *   ContentStudioDataChatProvider.tsx's own header for why grounding
 *   must not inherit that same normalization.
 *
 * There is no distinct `loading` state: both `profile` and
 * `recentGenerations` arrive as already-resolved Next.js server-component
 * props (Dashboard's own page.tsx already awaited them before rendering
 * `DashboardClient`), so there is no client-visible in-flight window.
 */
export type ContentStudioSourceStatus = 'not_loaded' | 'ready' | 'error';
