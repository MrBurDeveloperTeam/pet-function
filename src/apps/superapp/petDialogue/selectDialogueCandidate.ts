import { isDialogueIneligible } from './sessionDedupe';
import type { DialogueCandidate } from './types';

/**
 * Dialogue-layer-only pool scan (see usePersonalizedPetDialogue.ts): given a
 * family's ORDERED candidate pool (business ordering already applied by the
 * provider — see e.g. expiredInventoryProvider.ts), returns the first
 * candidate that is not session-seen or explicitly dismissed for `userId`,
 * or `null` if every candidate in the pool is currently ineligible.
 *
 * Deliberately lives here, not in any providers/*.ts file: providers must
 * stay pure/deterministic/storage-independent (see the provider files'
 * `candidates` field docs), so all sessionStorage/localStorage-aware
 * suppression is confined to this one small helper plus sessionDedupe.ts.
 *
 * No cascading/queueing: this only ever answers "what is the correct
 * candidate for THIS evaluation", not "show the next one immediately after
 * this one closes" — usePersonalizedPetDialogue.ts calls it once per family
 * per activation cycle, same as the single-candidate check it replaces.
 */
export function selectFirstEligibleDialogueCandidate(
  userId: string,
  orderedCandidates: DialogueCandidate[]
): DialogueCandidate | null {
  for (const candidate of orderedCandidates) {
    if (!isDialogueIneligible(userId, candidate.dedupeKey)) return candidate;
  }
  return null;
}
