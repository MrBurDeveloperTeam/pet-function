// Closed reminders advance one step per reload in this tab. Closing Welcome
// Back clears the progress so the next reload begins at the first live alert.

import { markDialogueClosedForRefresh, readClosedDialogueKeys, resetDialogueProgress } from '../../../cat/internal/refreshDialogueProgress';

const DISMISSAL_STORAGE_PREFIX = 'snabbb_pet_dialogue';
const APP_ID = 'superapp';

/** Exported so CatMascot.tsx's cross-tab `storage` listener can compare
 *  `event.key` against the exact key for the dialogue instance currently
 *  visible in that tab, without duplicating the key format in two places. */
export function buildDialogueDismissalKey(userId: string, dedupeKey: string): string {
  return `${DISMISSAL_STORAGE_PREFIX}:${userId}:${dedupeKey}`;
}

/** Close/CTA records this step for the next reload. */
export function markDialogueDismissed(userId: string, dedupeKey: string): void {
  markDialogueClosedForRefresh(APP_ID, userId, dedupeKey);
}

/** True only after this candidate was closed, never merely displayed. */
export function isDialogueSeenThisSession(userId: string, dedupeKey: string): boolean {
  return Boolean(userId && dedupeKey && readClosedDialogueKeys(APP_ID, userId).has(dedupeKey));
}

/** A closed candidate is skipped on the next reload. */
export function isDialogueIneligible(userId: string, dedupeKey: string): boolean {
  return isDialogueSeenThisSession(userId, dedupeKey);
}

export function resetDialogueRound(userId: string): void {
  resetDialogueProgress(APP_ID, userId);
}

/**
 * Explicit, user-scoped clear for logout: removes only this feature's own
 * `snabbb_pet_dialogue:{userId}:*` (localStorage) keys, never anything
 * else. Deliberately does not call `localStorage.clear()` — that would also
 * wipe unrelated Snabbb local state (SSO sync flags, `intro_shown_{userId}`,
 * pet stats, theme, etc.) that this feature has no business touching. This
 * is also the only mechanism that clears this feature's state on the
 * cross-tab `SSO_LOGOUT` path in App.tsx, which does not go through the
 * app's broader logout/sign-out flow. The tab's reminder progress is also
 * cleared for this user by resetDialogueRound above.
 */
export function clearPersonalizedDialogueSession(userId: string): void {
  if (!userId) return;
  resetDialogueRound(userId);
  try {
    const prefix = `${DISMISSAL_STORAGE_PREFIX}:${userId}:`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (err) {
    console.warn('[petDialogue] could not clear dialogue dismissal state on logout:', err);
  }
}
