// Pure evaluator over the already-computed `LatestGenerationSelection`
// (see ../../utils/generationProjection.ts's `selectLatestGeneration` —
// Phase-2's own tri-state selector, reused verbatim, not reimplemented).
// No Supabase query here.
//
// STATUS VALIDATION: only `'processing' | 'completed' | 'failed'` are
// treated as live-authoritative (both generation API routes insert
// `'processing'` directly and only ever move to `'completed'`/`'failed'`
// — confirmed by source inspection in the readiness pass).
// `'pending'` exists in the `Generation['status']` type union but has no
// live write path — an (unexpected, currently unreachable) row with that
// status is treated as an evaluation failure rather than silently
// reinterpreted as `'processing'`.
//
// TRI-STATE PRESERVED: `'unknown'` (rows exist but none have a
// parseable `createdAt`) is NOT the same as `'empty'` (genuinely zero
// rows) — this provider surfaces that distinction to the resolver rather
// than collapsing it, exactly like Phase-2's own resolver does.
//
// MODEL-SAFE FACTS: `{hasGeneration, generationType?, status?}` — no
// `generationId` (kept local-only, see sourceRecordIds), no `prompt`, no
// `output_url`, no `createdAt` (not required to answer "what did you
// most recently generate" factually, and adding it would require no new
// query but is intentionally omitted per the task's "do not widen
// projections/queries just for decorative phrasing" instruction).

import type { LatestGenerationSelection } from '../../utils/generationProjection';

export interface RecentGenerationDataFacts {
  hasGeneration: boolean;
  generationType?: 'image' | 'video';
  status?: 'processing' | 'completed' | 'failed';
}

const LIVE_STATUSES = new Set(['processing', 'completed', 'failed']);

export type RecentGenerationEvaluation =
  | { ok: true; facts: RecentGenerationDataFacts; sourceRecordIds: string[] }
  | { ok: false };

export function buildRecentGenerationDataFacts(
  selection: LatestGenerationSelection | null
): RecentGenerationEvaluation {
  if (!selection) return { ok: false };

  if (selection.state === 'unknown') return { ok: false };

  if (selection.state === 'empty') {
    return { ok: true, facts: { hasGeneration: false }, sourceRecordIds: [] };
  }

  const { generation } = selection;
  if (generation.type !== 'image' && generation.type !== 'video') return { ok: false };
  if (!LIVE_STATUSES.has(generation.status)) return { ok: false };

  return {
    ok: true,
    facts: {
      hasGeneration: true,
      generationType: generation.type,
      status: generation.status as 'processing' | 'completed' | 'failed',
    },
    sourceRecordIds: [generation.id],
  };
}
