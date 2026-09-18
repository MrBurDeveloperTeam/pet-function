// Phase 1A de-duplication: TWO separate, intentionally non-merged
// persistence concepts.
//
// 1. SAME-TAB/SESSION "seen" state — sessionStorage, per tab. Written the
//    instant a candidate is actually shown (see markDialogueSeenThisSession,
//    called from CatMascot.tsx's tryActivateDialog via markShown below).
//    Purpose: don't show the same candidate again and again within one tab
//    once it's already been surfaced there. Never visible to other tabs —
//    sessionStorage is strictly per-tab by spec.
//
// 2. CROSS-TAB "dismissed" state — localStorage, shared across all tabs.
//    Written ONLY on an explicit user action: clicking Close or a dialogue's
//    CTA (see markDialogueDismissed, called from CatMascot.tsx's
//    closeDialog() and from this hook's own runAction). Purpose: once the
//    user has actually acted on a dialogue in any one tab, no other
//    already-open tab or later-opened tab may show that same instance again.
//
// These must never collapse into a single write: merely DISPLAYING a
// dialogue must never suppress it cross-tab — only an explicit Close/CTA may
// do that. See isDialogueIneligible below, which composes both checks for
// callers that just need "should this candidate be considered at all" while
// keeping the two storages and their write paths fully independent.
//
// Both are always namespaced by BOTH authenticated user id AND dedupeKey:
//   - user id: so account switching can never reuse another user's seen/
//     dismissal state (see clearPersonalizedDialogueSession, which only
//     ever clears the outgoing user's own keys).
//   - dedupeKey: so handling one candidate INSTANCE never suppresses a
//     different instance of the same category — e.g. dismissing
//     `expired:item-123` must not block `expired:item-456` from later
//     becoming eligible and appearing.
//
// CROSS-TAB PROPAGATION (dismissal only): same-tab code that calls
// `markDialogueDismissed` writes localStorage synchronously and can read it
// back immediately via `isDialogueDismissed` in that same tab. OTHER
// already-open tabs are notified via the browser's native `storage` event
// (window-level, fired automatically whenever another document with access
// to the same localStorage changes it) — see CatMascot.tsx's own `storage`
// listener, which uses `buildDialogueDismissalKey` below to recognize when
// the event is for the exact dialogue instance currently visible in that
// tab, and suppresses it locally WITHOUT writing localStorage again (the
// browser does not fire `storage` in the tab that performed the write, only
// in every other tab, so there is no loop risk either way — but the
// listener still performs a local-only close, never a second persistence
// write, since the key is already present in shared storage). A brand-new
// tab opened later simply calls isDialogueDismissed (via
// isDialogueIneligible) before ever showing a candidate, which already
// reads the current localStorage state — no separate "new tab" code path is
// required.

const DISMISSAL_STORAGE_PREFIX = 'snabbb_pet_dialogue';
const SEEN_STORAGE_PREFIX = 'snabbb_pet_dialogue_seen';
const DISMISSED_VALUE = 'handled';
const SEEN_VALUE = 'seen';

/** Exported so CatMascot.tsx's cross-tab `storage` listener can compare
 *  `event.key` against the exact key for the dialogue instance currently
 *  visible in that tab, without duplicating the key format in two places. */
export function buildDialogueDismissalKey(userId: string, dedupeKey: string): string {
  return `${DISMISSAL_STORAGE_PREFIX}:${userId}:${dedupeKey}`;
}

function buildDialogueSeenKey(userId: string, dedupeKey: string): string {
  return `${SEEN_STORAGE_PREFIX}:${userId}:${dedupeKey}`;
}

/** Cross-tab: true once Close/CTA has been explicitly clicked for this exact
 *  userId + dedupeKey, in this tab or any other. */
export function isDialogueDismissed(userId: string, dedupeKey: string): boolean {
  if (!userId || !dedupeKey) return false;
  try {
    return localStorage.getItem(buildDialogueDismissalKey(userId, dedupeKey)) === DISMISSED_VALUE;
  } catch {
    // localStorage can throw in some privacy modes — treat as "not yet
    // dismissed", the safe default (worst case: the dialogue shows again).
    return false;
  }
}

/** Cross-tab: call ONLY from an explicit Close or CTA action — never at
 *  show-time. See markDialogueSeenThisSession for the show-time mark. */
export function markDialogueDismissed(userId: string, dedupeKey: string): void {
  if (!userId || !dedupeKey) return;
  try {
    localStorage.setItem(buildDialogueDismissalKey(userId, dedupeKey), DISMISSED_VALUE);
  } catch (err) {
    console.warn('[petDialogue] could not persist dialogue dismissal state:', err);
  }
}

/** Same-tab only: true once this candidate has already been shown once in
 *  this tab's session. */
export function isDialogueSeenThisSession(userId: string, dedupeKey: string): boolean {
  if (!userId || !dedupeKey) return false;
  try {
    return sessionStorage.getItem(buildDialogueSeenKey(userId, dedupeKey)) === SEEN_VALUE;
  } catch {
    return false;
  }
}

/** Same-tab only: call at show-time. Never propagates cross-tab. */
export function markDialogueSeenThisSession(userId: string, dedupeKey: string): void {
  if (!userId || !dedupeKey) return;
  try {
    sessionStorage.setItem(buildDialogueSeenKey(userId, dedupeKey), SEEN_VALUE);
  } catch (err) {
    console.warn('[petDialogue] could not persist dialogue seen-this-session state:', err);
  }
}

/** Composes both checks for eligibility callers: a candidate already seen
 *  this tab-session, OR explicitly dismissed cross-tab, is not eligible to
 *  be (re-)selected. Keeps both underlying storages and their write paths
 *  fully separate — this is a read-only composition, not a merged record. */
export function isDialogueIneligible(userId: string, dedupeKey: string): boolean {
  return isDialogueSeenThisSession(userId, dedupeKey) || isDialogueDismissed(userId, dedupeKey);
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
