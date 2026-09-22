// Pure evaluator over the already-selected latest generation (see
// ../utils/generationProjection.ts's `selectLatestGeneration`). No
// Supabase query here.
//
// Both `pending` and `processing` qualify. The current API routes create
// rows as `processing`, while the shared Generation contract and the
// dashboard's own loading UI explicitly recognize `pending` as the
// earlier active state. Treating both as "still processing" prevents the
// pet from falling through to a lower-priority plan message while a real
// generation is waiting to start.
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
  status: 'pending' | 'processing';
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
  if (latest.status !== 'pending' && latest.status !== 'processing') return null;
  if (latest.type !== 'image' && latest.type !== 'video') return null;

  const facts: LatestGenerationProcessingFacts = {
    generationId: latest.id,
    generationType: latest.type,
    status: latest.status,
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
