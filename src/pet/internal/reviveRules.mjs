export const REVIVE_COSTS = [200, 800, 2000];
export function addWatchedTime(total, mediaDelta, wallDelta, playing, visible) {
  if (!playing || !visible || !Number.isFinite(mediaDelta) || mediaDelta<=0 || mediaDelta>=2.5 || !Number.isFinite(wallDelta) || wallDelta<=0) return total;
  return Math.min(30,total+Math.min(mediaDelta,wallDelta));
}
