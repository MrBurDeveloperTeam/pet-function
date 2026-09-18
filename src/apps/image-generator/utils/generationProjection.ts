// Runtime data-minimization boundary between the dashboard's existing
// `recentGenerations` state (`src/app/(app)/dashboard/page.tsx`'s
// `.select("id, type, mode, model, prompt, output_url, status, created_at")`,
// already loaded — no new Supabase query) and the AI Experience pipeline.
//
// The dashboard's own `Generation` rows carry `prompt`, `output_url`,
// `mode`, and `model` — none of which any Slice-1 candidate needs.
// TypeScript structural typing does not strip properties at runtime, so a
// narrower TS type alone would not keep those fields out of anything
// holding a reference to the original rows. This function builds
// brand-new plain objects containing only `id`/`type`/`status`/
// `createdAt` before anything reaches a provider.
//
// `type` is read straight from `Generation['type']` (`'image' | 'video'`,
// a closed TS union) rather than re-validated against a broader set —
// both generation API routes (`src/app/api/generate/image/route.ts`,
// `.../video/route.ts`) insert exactly the literal `'image'`/`'video'`
// values, confirmed by direct source inspection, so this is a genuinely
// closed, safe operational value, not a guess.

import type { Generation } from '../types/generation';

export interface ProjectedGeneration {
  id: string;
  type: Generation['type'];
  status: Generation['status'];
  createdAt: string;
}

export function projectGenerationsForInsight(generations: Generation[]): ProjectedGeneration[] {
  return generations.map((g) => ({
    id: g.id,
    type: g.type,
    status: g.status,
    createdAt: g.created_at,
  }));
}

/**
 * Result of `selectLatestGeneration` — a real tri-state, not a nullable
 * shorthand, because "no rows at all" and "rows exist but none have a
 * usable timestamp" are NOT the same thing and must not be collapsed:
 *
 *   - `'empty'`: the list itself has zero rows (a genuinely empty,
 *     successfully-fetched history) — Failed/Processing correctly don't
 *     qualify, and the resolver MAY proceed to Plan/Entitlement.
 *   - `'unknown'`: the list has rows, but NONE of them have a valid,
 *     parseable `createdAt` — which one (if any) is actually the latest
 *     cannot be determined, so the resolver must NOT proceed to Plan
 *     either (a higher-priority Failed/Processing state might genuinely
 *     exist among those rows and simply be unprovable right now).
 *   - `'selected'`: at least one row has a valid timestamp; the winner is
 *     chosen only from that valid subset.
 */
export type LatestGenerationSelection =
  | { state: 'empty' }
  | { state: 'unknown' }
  | { state: 'selected'; generation: ProjectedGeneration };

/**
 * Deterministic "latest generation" selection over the already-loaded,
 * already-ordered `recentGenerations` (the dashboard's own query already
 * sorts `created_at DESC`, but ties at the SQL level are unspecified —
 * see this feature's implementation report). Re-sorts defensively by
 * `createdAt DESC` with a stable `id ASC` tie-break rather than trusting
 * array index 0, so the same input always produces the same winner
 * regardless of any unspecified row order for exactly-equal timestamps.
 *
 * A malformed/unparseable `createdAt` row is EXCLUDED from the candidate
 * pool entirely before ordering/tie-break ever runs — it can never win
 * the "latest" spot over a row with a real timestamp, and if it's the
 * ONLY kind of row present, this returns `{state: 'unknown'}` rather than
 * letting an id-based tie-break among invalid rows fabricate a fake
 * winner (see `LatestGenerationSelection`'s doc comment above).
 *
 * In practice `generations.created_at` is a live, authoritative
 * `NOT NULL` column (default `now()` — see this feature's implementation
 * report), so a malformed value should never actually reach this
 * function from the current schema; this remains defense-in-depth
 * against any future/legacy data this repo doesn't currently control.
 */
export function selectLatestGeneration(generations: ProjectedGeneration[]): LatestGenerationSelection {
  if (generations.length === 0) return { state: 'empty' };

  const valid = generations
    .map((g) => ({ generation: g, ms: Date.parse(g.createdAt) }))
    .filter((entry): entry is { generation: ProjectedGeneration; ms: number } => Number.isFinite(entry.ms));

  if (valid.length === 0) return { state: 'unknown' };

  valid.sort((a, b) => {
    if (a.ms !== b.ms) return b.ms - a.ms;
    return a.generation.id < b.generation.id ? -1 : a.generation.id > b.generation.id ? 1 : 0;
  });

  return { state: 'selected', generation: valid[0]!.generation };
}
