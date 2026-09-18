// Phase-2B -> proactive Cat reminder: explicit, cross-tab, RELOAD-SURVIVING
// dismissal state only.
//
// CROSS-TAB "dismissed" state — localStorage, shared across all Profit
// Calculator tabs on this origin. Written ONLY on an explicit user
// action: clicking Close or the reminder's CTA. Purpose: once the user
// has actually acted on the reminder in any one tab, no other
// already-open tab or later-opened tab — nor that SAME tab after a full
// reload — may show that same instance again.
//
// Merely DISPLAYING the reminder must never write this — only an explicit
// Close/CTA may. "Shown this activation, not yet explicitly handled"
// suppression is a SEPARATE, deliberately non-persisted concept — see
// CatMascot.jsx's own `shownCandidateKeysRef` (a plain in-memory
// `useRef(new Set())`, reset on every fresh mount). This file previously
// also exposed a sessionStorage-backed "seen this session" pair
// (`isDialogueSeenThisSession`/`markDialogueSeenThisSession`, composed
// via `isDialogueIneligible`) — that was removed (matching the
// browser-verified fix already applied in the Content Studio repo)
// because sessionStorage SURVIVES a same-tab full page reload (standard,
// spec'd browser behavior), so it was incorrectly suppressing a candidate
// the user had never actually Closed/CTA'd, on every subsequent reload.
// Persisted storage is the wrong layer for "don't reopen within this one
// mount"; only genuinely explicit handling belongs in storage that
// outlives the mount.
//
// Both are namespaced by BOTH the authenticated Supabase user id AND the
// candidate's own `dedupeKey`, so a different candidate instance (e.g. a
// different saved-plan id) is never suppressed by an unrelated dismissal,
// and account switching can never reuse another user's state.
//
// CROSS-TAB PROPAGATION: CatMascot.jsx's own `storage` listener recognizes
// when another tab wrote the exact key for the currently-visible candidate
// and suppresses it locally — WITHOUT writing localStorage again (the
// browser never fires `storage` in the tab that performed the write, only
// in every other tab, so there's no loop risk either way, but the
// listener still performs a local-only close since the key is already
// present in shared storage).
//
// SAME-APP ONLY: localStorage is origin-scoped. A dismissal here can
// never suppress the same reminder on a different Snabbb origin (e.g.
// app.snabbb.com's App Gallery, or another mini-app). True cross-app
// dismissal sync would require a shared backend/DB-backed dismissal
// table — a separate, larger feature, not attempted here.

const DISMISSAL_STORAGE_PREFIX = 'snabbb_pet_dialogue';
const DISMISSED_VALUE = 'handled';

/** Exported so CatMascot.jsx's cross-tab `storage` listener can compare
 *  `event.key` against the exact key for the candidate currently visible,
 *  without duplicating the key format in two places. */
export function buildDialogueDismissalKey(userId: string, dedupeKey: string): string {
  return `${DISMISSAL_STORAGE_PREFIX}:${userId}:${dedupeKey}`;
}

/** Cross-tab, reload-surviving: true once Close/CTA has been explicitly
 *  clicked for this exact userId + dedupeKey, in this tab or any other
 *  same-origin tab (or this same tab in an earlier page load). */
export function isDialogueDismissed(userId: string, dedupeKey: string): boolean {
  if (!userId || !dedupeKey) return false;
  try {
    return localStorage.getItem(buildDialogueDismissalKey(userId, dedupeKey)) === DISMISSED_VALUE;
  } catch {
    // localStorage can throw in some privacy modes — treat as "not yet
    // dismissed", the safe default (worst case: the reminder shows again).
    return false;
  }
}

/** Cross-tab, reload-surviving: call ONLY from an explicit Close or CTA
 *  action — never at show-time. See CatMascot.jsx's
 *  `shownCandidateKeysRef` for the separate, non-persisted, mount-scoped
 *  show-time mark. */
export function markDialogueDismissed(userId: string, dedupeKey: string): void {
  if (!userId || !dedupeKey) return;
  try {
    localStorage.setItem(buildDialogueDismissalKey(userId, dedupeKey), DISMISSED_VALUE);
  } catch (err) {
    console.warn('[aiExperience] could not persist pet dialogue dismissal state:', err);
  }
}
