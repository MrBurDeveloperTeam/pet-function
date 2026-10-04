export interface RunnerRecord {
    id: string;
    rank: number;
    name: string;
    teeth: number;
    isYou: boolean;
    avatarUrl: string | null;
}

export const RIVAL_NOTICE_TEETH = 100;

export function runnerAvatarUrl(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    const url = value.trim();
    if (url.startsWith('/') && !url.startsWith('//')) return url;
    try {
        const parsed = new URL(url);
        return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? url : null;
    } catch { return null; }
}

export function runnerRecords(value: unknown, userId: string | null): RunnerRecord[] {
    if (!Array.isArray(value)) return [];
    const records = new Map<string, RunnerRecord>();
    for (const row of value) {
        if (!row || typeof row !== 'object' || !Number.isSafeInteger(row.teeth) || row.teeth < 0) continue;
        const name = typeof row.name === 'string' ? row.name.trim().slice(0, 40) || 'Runner' : 'Runner';
        const rank = Number.isSafeInteger(row.rank) && row.rank > 0 ? row.rank : records.size + 1;
        const id = typeof row.userId === 'string' && row.userId ? row.userId : `legacy:${rank}:${name}`;
        records.set(id, { id, rank, name, teeth: row.teeth, isYou: row.isYou === true || id === userId, avatarUrl: runnerAvatarUrl(row.avatarUrl) });
    }
    return [...records.values()].sort((a, b) => a.rank - b.rank);
}

/** Uses a run-local snapshot: network refreshes cannot replay an overtake. */
export class RunnerRivals {
    private records: RunnerRecord[] = [];
    private passed = new Set<string>();
    private score = 0;

    start(records: RunnerRecord[]) {
        this.score = 0;
        this.passed.clear();
        this.updateRecords(records);
    }

    updateRecords(records: RunnerRecord[]) {
        this.records = records.filter(row => !row.isYou).sort((a, b) => a.teeth - b.teeth || a.rank - b.rank);
        // A board arriving late is not evidence that a crossing just happened.
        for (const row of this.records) if (row.teeth < this.score) this.passed.add(row.id);
    }

    advance(score: number) {
        if (!Number.isSafeInteger(score) || score < this.score) return { target: this.target(), passed: [] as RunnerRecord[] };
        const crossed = this.records.filter(row => !this.passed.has(row.id) && this.score <= row.teeth && score > row.teeth);
        for (const row of crossed) this.passed.add(row.id);
        this.score = score;
        return { target: this.target(), passed: crossed };
    }

    target(): RunnerRecord | null {
        return this.records.find(row => !this.passed.has(row.id) && row.teeth >= this.score && row.teeth - this.score <= RIVAL_NOTICE_TEETH) ?? null;
    }
}
