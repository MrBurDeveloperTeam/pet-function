// Closed reminders survive a reload in this tab. A completed Welcome Back
// clears the list so the next reload starts a fresh round.
const PREFIX = 'snabbb_cat_dialogue_progress:v1';
const closedOnThisPage = new Set<string>();

function storageKey(appId: string, userId: string): string {
  return `${PREFIX}:${appId}:${userId}`;
}

/** A React remount or client-side route change is not a browser refresh. */
export function holdDialogueUntilReload(appId: string, userId: string): void {
  if (appId && userId) closedOnThisPage.add(storageKey(appId, userId));
}

export function isDialogueHeldUntilReload(appId: string, userId: string): boolean {
  return Boolean(appId && userId && closedOnThisPage.has(storageKey(appId, userId)));
}

export function readClosedDialogueKeys(appId: string, userId: string): Set<string> {
  if (!appId || !userId) return new Set();
  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey(appId, userId)) ?? '[]');
    return new Set(Array.isArray(stored) ? stored.filter((key): key is string => typeof key === 'string') : []);
  } catch {
    return new Set();
  }
}

export function markDialogueClosedForRefresh(appId: string, userId: string, dedupeKey: string): void {
  if (!appId || !userId || !dedupeKey) return;
  const closed = readClosedDialogueKeys(appId, userId);
  closed.add(dedupeKey);
  try {
    sessionStorage.setItem(storageKey(appId, userId), JSON.stringify([...closed]));
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
  }
}

export function resetDialogueProgress(appId: string, userId: string): void {
  if (!appId || !userId) return;
  try {
    sessionStorage.removeItem(storageKey(appId, userId));
  } catch {
    // A blocked storage API must not prevent the dialog from closing.
  }
}
