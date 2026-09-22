// Dialogue suppression is scoped to one in-memory walkthrough. Historical
// localStorage/sessionStorage keys are deliberately ignored: closing Welcome
// Back ends this round, and refreshing or logging back in starts from item 1.

const DISMISSAL_STORAGE_PREFIX = 'snabbb_pet_dialogue';
const SEEN_STORAGE_PREFIX = 'snabbb_pet_dialogue_seen';
const seenInCurrentRound = new Set<string>();

/** Exported so CatMascot.tsx's cross-tab `storage` listener can compare
 *  `event.key` against the exact key for the dialogue instance currently
 *  visible in that tab, without duplicating the key format in two places. */
export function buildDialogueDismissalKey(userId: string, dedupeKey: string): string {
  return `${DISMISSAL_STORAGE_PREFIX}:${userId}:${dedupeKey}`;
}

function buildDialogueSeenKey(userId: string, dedupeKey: string): string {
  return `${SEEN_STORAGE_PREFIX}:${userId}:${dedupeKey}`;
}

/** Close/CTA advances this round, without persisting suppression. */
export function markDialogueDismissed(userId: string, dedupeKey: string): void {
  // Closing a dialogue advances this round; it does not suppress future visits.
  markDialogueSeenThisSession(userId, dedupeKey);
}

/** True once this candidate has appeared in the current walkthrough. */
export function isDialogueSeenThisSession(userId: string, dedupeKey: string): boolean {
  return Boolean(userId && dedupeKey && seenInCurrentRound.has(buildDialogueSeenKey(userId, dedupeKey)));
}

/** Call at show-time. Never persists or propagates across tabs. */
export function markDialogueSeenThisSession(userId: string, dedupeKey: string): void {
  if (!userId || !dedupeKey) return;
  seenInCurrentRound.add(buildDialogueSeenKey(userId, dedupeKey));
}

/** A candidate can appear only once in the current walkthrough. */
export function isDialogueIneligible(userId: string, dedupeKey: string): boolean {
  return isDialogueSeenThisSession(userId, dedupeKey);
}

export function resetDialogueRound(userId: string): void {
  if (!userId) return;
  for (const key of seenInCurrentRound) {
    if (key.startsWith(`${SEEN_STORAGE_PREFIX}:${userId}:`)) seenInCurrentRound.delete(key);
  }
}

/**
 * Explicit, user-scoped clear for logout: removes only this feature's own
 * `snabbb_pet_dialogue:{userId}:*` (localStorage) keys, never anything
 * else. Deliberately does not call `localStorage.clear()` — that would also
 * wipe unrelated Snabbb local state (SSO sync flags, `intro_shown_{userId}`,
 * pet stats, theme, etc.) that this feature has no business touching. This
 * is also the only mechanism that clears this feature's state on the
 * cross-tab `SSO_LOGOUT` path in App.tsx, which does not go through the
 * app's broader logout/sign-out flow. sessionStorage "seen" keys are
 * deliberately left untouched here — they're already tab-scoped and expire
 * with the tab/session on their own; logout does not need to (and
 * previously did not) reach into sessionStorage for this feature.
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
