// Pure evaluator over the already-selected latest generation (see
// ../utils/generationProjection.ts's `selectLatestGeneration`). No
// Supabase query here.
//
// Only `status === 'processing'` qualifies — NOT `'pending'`. Source
// inspection (both `src/app/api/generate/image/route.ts` and
// `.../video/route.ts`) shows the generation row is inserted with
// `status: "processing"` directly; neither route ever writes `"pending"`
// anywhere. `'pending'` exists in the `Generation['status']` type union
// and in `GenerationCard`'s display logic (`isLoading = status ===
// 'pending' || status === 'processing'`) but is not actually produced by
// the current generation flow — there is no evidence it represents a
// genuinely active, currently-used generation state in this repo today.
// Treating it as equivalent to `'processing'` here would be a guess this
// slice deliberately does not make; if `'pending'` becomes real later,
// this is a one-line, explicit product decision to revisit, not a
// silent scope expansion now.
//
// CURRENT-STATE REFLECTION ONLY, no polling: this simply stops being
// true once the latest generation's status changes on the next page
// load/data refresh — no realtime/interval mechanism is added to make it
// update live mid-session.

import type { ProjectedGeneration } from '../utils/generationProjection';
import type { InsightCandidate } from '../contracts/insightCandidate';

export interface LatestGenerationProcessingFacts {
  generationId: string;
  generationType: 'image' | 'video';
  status: 'processing';
}

/** See LatestGenerationFailedCandidate's doc comment
 *  (../providers/latestGenerationFailedProvider.ts) for why this
 *  literal-narrowed `triggerId` override exists. */
export interface LatestGenerationProcessingCandidate
  extends InsightCandidate<LatestGenerationProcessingFacts> {
  triggerId: 'content_generation_processing';
}

function buildMessage(type: 'image' | 'video'): string {
  return type === 'image'
    ? 'Your latest image generation is still processing.'
    : 'Your latest video generation is still processing.';
}

export function evaluateLatestGenerationProcessing(
  latest: ProjectedGeneration | null
): LatestGenerationProcessingCandidate | null {
  if (!latest) return null;
  if (latest.status !== 'processing') return null;
  if (latest.type !== 'image' && latest.type !== 'video') return null;

  const facts: LatestGenerationProcessingFacts = {
    generationId: latest.id,
    generationType: latest.type,
    status: 'processing',
  };

  return {
    app: 'content-studio',
    triggerId: 'content_generation_processing',
    priority: 'INFO',
    facts,
    messageTemplate: 'Your latest {generationType} generation is still processing.',
    message: buildMessage(latest.type),
    // Navigation only — never Refresh/Cancel/Retry (no such behavior
    // exists anywhere in this repo to wire this to). Destination decided
    // at the call site (DashboardClient.tsx), per this contract's own
    // InsightAction doc: `/history?id={generationId}` is HistoryClient's
    // own existing auto-focus mechanism (its `searchParams.get('id')`
    // effect), not a new route — see that file's own comment.
    action: { label: 'View Progress' },
    dedupeKey: `content_generation_processing:${latest.id}`,
    sourceRecordId: latest.id,
    evaluatedAt: new Date().toISOString(),
  };
}
