/**
 * Explicit, cross-tab, RELOAD-SURVIVING dismissal state — the persisted
 * half of the dismissal engine (the other half, mount-scoped "shown this
 * activation" tracking, is deliberately in-memory only and lives in
 * runtime.ts, never here).
 *
 * NEW namespaced key format (adds appId, preventing collisions if
 * multiple Snabbb apps ever share an origin):
 *   snabbb_pet_dialogue:{appId}:{userId}:{dedupeKey}
 *
 * LEGACY key format (written by every pre-Phase-3B host, e.g. Content
 * Studio before this migration):
 *   snabbb_pet_dialogue:{userId}:{dedupeKey}
 *
 * Read-compatible migration only: eligibility treats a candidate as
 * dismissed when EITHER key exists. New explicit Close/CTA writes ONLY
 * the new namespaced key — legacy keys are never deleted, never rewritten,
 * and existing users' localStorage is never enumerated or mass-migrated.
 * This lets old and new tabs/versions coexist safely during rollout.
 *
 * No sessionStorage anywhere in this file, or anywhere in this package's
 * dialogue runtime — "merely shown" suppression is mount-scoped in-memory
 * only (see runtime.ts's shownCandidateKeysRef).
 */

const PREFIX = 'snabbb_pet_dialogue';
const DISMISSED_VALUE = 'handled';

export function buildDismissalKey(appId: string, userId: string, dedupeKey: string): string {
  return `${PREFIX}:${appId}:${userId}:${dedupeKey}`;
}

export function buildLegacyDismissalKey(userId: string, dedupeKey: string): string {
  return `${PREFIX}:${userId}:${dedupeKey}`;
}

export function isDismissed(appId: string, userId: string, dedupeKey: string): boolean {
  if (!appId || !userId || !dedupeKey) return false;
  try {
    if (localStorage.getItem(buildDismissalKey(appId, userId, dedupeKey)) === DISMISSED_VALUE) {
      return true;
    }
    if (localStorage.getItem(buildLegacyDismissalKey(userId, dedupeKey)) === DISMISSED_VALUE) {
      return true;
    }
    return false;
  } catch {
    // localStorage can throw in some privacy modes — treat as "not yet
    // dismissed", the safe default (worst case: the reminder shows again).
    return false;
  }
}

export function markDismissed(appId: string, userId: string, dedupeKey: string): void {
  if (!appId || !userId || !dedupeKey) return;
  try {
    localStorage.setItem(buildDismissalKey(appId, userId, dedupeKey), DISMISSED_VALUE);
  } catch (err) {
    console.warn('[molar-experience] could not persist dialogue dismissal state:', err);
  }
}

/** True if `event.key` is either the new or legacy dismissal key for the
 *  given appId/userId/dedupeKey — used by the runtime's cross-tab
 *  `storage` listener so an old-format write in another tab still closes
 *  the currently-adopted candidate locally. */
export function matchesDismissalKey(
  eventKey: string,
  appId: string,
  userId: string,
  dedupeKey: string
): boolean {
  return (
    eventKey === buildDismissalKey(appId, userId, dedupeKey) ||
    eventKey === buildLegacyDismissalKey(userId, dedupeKey)
  );
}
