/** Integer wallet coins; only complete active minutes earn XP. */
export function runnerRewards(teeth: unknown, elapsedSeconds: unknown) {
  if (typeof teeth !== 'number' || !Number.isSafeInteger(teeth) || teeth < 0 ||
      typeof elapsedSeconds !== 'number' || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) return null;
  return { coins: Math.floor(teeth / 10), xp: Math.floor(elapsedSeconds / 60) * 2 };
}
