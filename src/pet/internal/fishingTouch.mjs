export function fishingTapAction(start, end, { phase, paused, tutorial }) {
  if (!start || start.id !== end.id || paused || tutorial || start.phase !== phase) return null;
  if (end.time-start.time > 650 || Math.hypot(end.x-start.x,end.y-start.y) > 12) return null;
  return { ready: 'cast', power: 'power', reeling: 'reel', result: 'again' }[phase] ?? null;
}
