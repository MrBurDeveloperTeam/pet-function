// Pure evaluator over the already-selected latest generation (see
// ../utils/generationProjection.ts's `selectLatestGeneration`). No
// Supabase query here — this function is synchronous and side-effect-free.
//
// CURRENT-STATE REFLECTION ONLY: this only ever looks at the single most
// recent generation, never scans historical rows for any past failure —
// an old failed generation must stop qualifying the moment a newer
// generation (of any status) exists. There is no persistent
// read/dismissed state for this trigger; it simply stops being true once
// the latest row changes on the next page load/data refresh.

import type { ProjectedGeneration } from '../utils/generationProjection';
import type { InsightCandidate } from '../contracts/insightCandidate';

export interface LatestGenerationFailedFacts {
  generationId: string;
  generationType: 'image' | 'video';
  status: 'failed';
}

/** See FollowedCreatorPostedCandidate's doc comment pattern (established
 *  in the E-Learning repo's aiExperience/providers) for why a
 *  literal-narrowed `triggerId` override is used on every candidate
 *  shape — it's what lets DashboardClient.tsx narrow on
 *  `candidate.triggerId === '...'` to get the right `candidate.facts`
 *  shape without an unsafe cast. */
export interface LatestGenerationFailedCandidate
  extends InsightCandidate<LatestGenerationFailedFacts> {
  triggerId: 'content_generation_failed';
}

function buildMessage(type: 'image' | 'video'): string {
  return type === 'image'
    ? 'Your latest image generation failed.'
    : 'Your latest video generation failed.';
}

export function evaluateLatestGenerationFailed(
  latest: ProjectedGeneration | null
): LatestGenerationFailedCandidate | null {
  if (!latest) return null;
  if (latest.status !== 'failed') return null;
  if (latest.type !== 'image' && latest.type !== 'video') return null;

  const facts: LatestGenerationFailedFacts = {
    generationId: latest.id,
    generationType: latest.type,
    status: 'failed',
  };

  return {
    app: 'content-studio',
    triggerId: 'content_generation_failed',
    priority: 'MEDIUM',
    facts,
    messageTemplate: 'Your latest {generationType} generation failed.',
    message: buildMessage(latest.type),
    // Action decided at the call site (DashboardClient.tsx) — Image AI
    // (`/image-ai`) is a real, currently-enabled route linked directly
    // from this same dashboard; Video AI's own dashboard quick-action
    // card is explicitly disabled ("temporarily unavailable... coming
    // soon"), so no action is offered for a video-type candidate rather
    // than pointing the user at a surface the dashboard itself currently
    // treats as unavailable. See DashboardClient.tsx's action wiring.
    ...(latest.type === 'image' ? { action: { label: 'Create Again' } } : {}),
    dedupeKey: `content_generation_failed:${latest.id}`,
    sourceRecordId: latest.id,
    evaluatedAt: new Date().toISOString(),
  };
}
