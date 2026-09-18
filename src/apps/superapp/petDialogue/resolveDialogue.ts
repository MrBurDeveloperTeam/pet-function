import type { DialogueCandidate, DialoguePriority } from './types';

const PRIORITY_RANK: Record<DialoguePriority, number> = {
  P0: 0,
  P1: 1,
  PROFILE: 2,
  P2: 3,
  LEGACY_INTRO: 4,
  FALLBACK: 5,
};

function compareCandidates(a: DialogueCandidate, b: DialogueCandidate): number {
  const rankDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (rankDiff !== 0) return rankDiff;

  const aEvent = a.eventTime ?? '';
  const bEvent = b.eventTime ?? '';
  if (aEvent !== bEvent) return aEvent < bEvent ? -1 : 1;

  const aCreated = a.createdTime ?? '';
  const bCreated = b.createdTime ?? '';
  if (aCreated !== bCreated) return aCreated < bCreated ? -1 : 1;

  const aId = a.recordId ?? a.dedupeKey;
  const bId = b.recordId ?? b.dedupeKey;
  if (aId !== bId) return aId < bId ? -1 : 1;

  return 0;
}

/**
 * Pure deterministic selection. No Supabase/network access here — callers
 * evaluate every candidate ahead of time and pass the already-resolved list.
 * `fallback` is required and is always what's returned when nothing else
 * qualifies, so this function never returns null/undefined.
 */
export function resolvePersonalizedDialogue(
  candidates: Array<DialogueCandidate | null | undefined>,
  fallback: DialogueCandidate
): DialogueCandidate {
  const eligible = candidates.filter((c): c is DialogueCandidate => Boolean(c));
  if (eligible.length === 0) return fallback;
  return [...eligible].sort(compareCandidates)[0];
}
