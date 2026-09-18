// Pure evaluator over the already-minimized `ProjectedGeneration[]` list
// (see ../../utils/generationProjection.ts's `projectGenerationsForInsight`
// — Phase-2's own minimization, reused verbatim). No Supabase query here,
// no new data source: this is the same already-loaded Dashboard-page
// `recentGenerations` list recentGenerationDataProvider.ts's single-latest
// selection is ALSO built from, just exposed as a list + status breakdown
// instead of collapsed down to one row.
//
// HONEST SCOPE: this is "your most recent N generations" (N = however
// many the Dashboard's own query loaded, currently capped at 8) — NEVER
// an all-time total. `contentstudio_recent_generation_count`-style
// all-time-count questions remain a genuine, separate limitation (see
// classifyContentStudioDataIntent.ts's own GENERATION_COUNT_PHRASES
// header) — this provider does not attempt to answer those.
//
// MODEL-SAFE FACTS: `{count, shownCount, byStatus:{processing,completed,
// failed}, generations:[{type, status, createdAt}]}` — no `id` (kept
// local-only, see sourceRecordIds), no prompt, no output_url.

import type { ProjectedGeneration } from '../../utils/generationProjection';

const MAX_LIST_ITEMS = 8;
const LIVE_STATUSES = new Set(['processing', 'completed', 'failed']);

export interface RecentGenerationsListItemFact {
  type: 'image' | 'video';
  status: 'processing' | 'completed' | 'failed';
  createdAt: string;
}

export interface RecentGenerationsListDataFacts {
  count: number;
  shownCount: number;
  byStatus: { processing: number; completed: number; failed: number };
  generations: RecentGenerationsListItemFact[];
}

/** Deterministic same-type tie-break: newest first (matches
 *  selectLatestGeneration.ts's own DESC ordering), then id — never
 *  array/object iteration order. A row with an unparseable `createdAt`
 *  or an unrecognized `type`/non-live `status` is excluded entirely,
 *  same fail-closed rule recentGenerationDataProvider.ts already uses —
 *  never silently reinterpreted or fabricated. */
function compareForOrdering(a: { g: ProjectedGeneration; ms: number }, b: { g: ProjectedGeneration; ms: number }): number {
  if (a.ms !== b.ms) return b.ms - a.ms;
  return a.g.id < b.g.id ? -1 : a.g.id > b.g.id ? 1 : 0;
}

export function buildRecentGenerationsListDataFacts(generations: ProjectedGeneration[]): {
  facts: RecentGenerationsListDataFacts;
  sourceRecordIds: string[];
} {
  const valid = generations
    .filter((g) => (g.type === 'image' || g.type === 'video') && LIVE_STATUSES.has(g.status))
    .map((g) => ({ g, ms: Date.parse(g.createdAt) }))
    .filter((entry) => Number.isFinite(entry.ms));

  const byStatus = { processing: 0, completed: 0, failed: 0 };
  for (const { g } of valid) {
    byStatus[g.status as 'processing' | 'completed' | 'failed'] += 1;
  }

  const ordered = [...valid].sort(compareForOrdering);
  const shown = ordered.slice(0, MAX_LIST_ITEMS);

  const facts: RecentGenerationsListDataFacts = {
    count: valid.length,
    shownCount: shown.length,
    byStatus,
    generations: shown.map(({ g }) => ({
      type: g.type as 'image' | 'video',
      status: g.status as 'processing' | 'completed' | 'failed',
      createdAt: g.createdAt,
    })),
  };

  return { facts, sourceRecordIds: shown.map(({ g }) => g.id) };
}
