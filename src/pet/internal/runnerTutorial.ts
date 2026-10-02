type TutorialStorage = Pick<Storage, 'getItem' | 'setItem'>;

const seenThisSession = new Set<string>();
const tutorialKey = (userId: string | null) => `pet-function:cat-dash-tutorial-seen-v1:${userId === null ? 'guest' : `user:${encodeURIComponent(userId)}`}`;

const browserStorage = (): TutorialStorage | null => {
    try { return typeof window === 'undefined' ? null : window.localStorage; }
    catch { return null; }
};

export const hasRunnerTutorialBeenSeen = (userId: string | null, storage = browserStorage()): boolean => {
    const key = tutorialKey(userId);
    if (seenThisSession.has(key)) return true;
    try { return storage?.getItem(key) === 'true'; }
    catch { return false; }
};

export const markRunnerTutorialSeen = (userId: string | null, storage = browserStorage()): void => {
    const key = tutorialKey(userId);
    seenThisSession.add(key);
    try { storage?.setItem(key, 'true'); }
    catch { /* Keep the session marker when browser storage is unavailable. */ }
};
