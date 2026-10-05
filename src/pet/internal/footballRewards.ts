export const FOOTBALL_SOURCE = 'pet-function:stadium-football';

export interface FootballResult {
  matchId: string;
  elapsedSeconds: number;
  homeGoals: number;
  awayGoals: number;
}

/** Only completed regulation or golden-goal matches earn rewards. */
export function footballRewards(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const result = value as FootballResult;
  if (typeof result.matchId !== 'string' || !result.matchId || result.matchId.length > 100
    || !Number.isFinite(result.elapsedSeconds) || result.elapsedSeconds < 180 || result.elapsedSeconds > 211
    || !Number.isSafeInteger(result.homeGoals) || !Number.isSafeInteger(result.awayGoals)
    || result.homeGoals < 0 || result.awayGoals < 0 || result.homeGoals > 50 || result.awayGoals > 50) return null;
  const won = result.homeGoals > result.awayGoals;
  const draw = result.homeGoals === result.awayGoals;
  return { coins: 50 + (won ? 30 : draw ? 10 : 0) + Math.min(result.homeGoals, 10) * 5, xp: won ? 40 : 25 };
}

export class FootballSettlement {
  private active: { id: string; startedAt: number } | null = null;
  private settled = new Set<string>();
  start(id: unknown, now: number) {
    if (typeof id !== 'string' || !id || id.length > 100 || this.settled.has(id)) return;
    if (this.active?.id === id) return;
    this.active = { id, startedAt: now };
  }
  complete(value: unknown, now: number) {
    const reward = footballRewards(value);
    if (!reward || !this.active) return null;
    const result = value as FootballResult;
    if (result.matchId !== this.active.id || this.settled.has(result.matchId)
      || result.elapsedSeconds > (now - this.active.startedAt) / 1000 + 2) return null;
    this.settled.add(result.matchId);
    this.active = null;
    return reward;
  }
}
