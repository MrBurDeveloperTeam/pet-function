export const RUNNER_POWERUP_COST = 30;
export type RunnerPowerup = 'magnet' | 'jetpack';

export interface RunnerPowerupStatus { magnet: number; jetpack: number; landing: boolean }
export const emptyRunnerPowerups = (): RunnerPowerupStatus => ({ magnet: 0, jetpack: 0, landing: false });
export function runnerPowerupStatus(value: unknown): RunnerPowerupStatus | null {
    if (!value || typeof value !== 'object') return null;
    const input = value as Record<string, unknown>;
    if (typeof input.magnet !== 'number' || typeof input.jetpack !== 'number' ||
        !Number.isFinite(input.magnet) || !Number.isFinite(input.jetpack)) return null;
    return { magnet: Math.max(0, Math.min(10, input.magnet)), jetpack: Math.max(0, Math.min(10, input.jetpack)), landing: input.landing === true };
}

/** One opening purchase per run. Cache the promise before awaiting the wallet,
 * so a repeated iframe message can never charge twice or grant both choices. */
export class RunnerPowerupPurchases {
    private runId: string | null = null;
    private choice: { requestId: string; kind: RunnerPowerup; result: Promise<boolean> } | null = null;
    start(runId: string) { this.runId = runId; this.choice = null; }
    close() { this.runId = null; }
    purchase(message: Record<string, unknown>, spend: (amount: number) => Promise<boolean>): Promise<boolean> {
        if (!this.runId || message.runId !== this.runId || typeof message.requestId !== 'string' ||
            message.requestId.length > 120 || !message.requestId || !['magnet', 'jetpack'].includes(String(message.kind))) return Promise.resolve(false);
        const kind = message.kind as RunnerPowerup;
        if (this.choice) return this.choice.requestId === message.requestId && this.choice.kind === kind ? this.choice.result : Promise.resolve(false);
        const result = Promise.resolve().then(() => spend(RUNNER_POWERUP_COST)).catch(() => false);
        this.choice = { requestId: message.requestId, kind, result };
        return result;
    }
}
