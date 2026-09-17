/**
 * One-time Intro-completed persistence. Format preserved EXACTLY as it
 * existed in Content Studio's pre-Phase-3B controller — user-scoped only,
 * no appId segment — since this is a read-compatible extraction, not a
 * redesign, and existing users already have keys in this exact shape.
 */
const KEY_PREFIX = 'intro_shown_';

export function isIntroCompleted(userId: string): boolean {
  try {
    return localStorage.getItem(`${KEY_PREFIX}${userId}`) === 'true';
  } catch {
    return false;
  }
}

export function markIntroCompleted(userId: string): void {
  if (!userId) return;
  try {
    localStorage.setItem(`${KEY_PREFIX}${userId}`, 'true');
  } catch (err) {
    console.warn('[molar-experience] could not persist intro completion state:', err);
  }
}
