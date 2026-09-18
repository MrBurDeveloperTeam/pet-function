import { toValidatedDateKey } from '../dateUtils';
import type { TodoSnapshotTask } from './todoSnapshotProvider';
// `TodoSnapshotTask` is a type-only import — no runtime dependency on the
// Supabase-touching snapshot provider (mirrors expiredInventoryProvider.ts's
// type-only relationship with inventorySnapshotProvider.ts).

/**
 * Shared pure filter for both P0 (overdue) and P2 (due today) High-task
 * evaluators — everything except the final date comparison against
 * `localToday` is identical between them, so it lives here once rather
 * than being duplicated (and risking drift) across two files.
 *
 * Returns `null` for any task that is inactive, not High urgency, or has an
 * unusable/malformed date/status/completion field — a malformed *optional*
 * field on one task row is never allowed to suppress every other user's
 * otherwise-valid urgent task, so the row is simply skipped rather than
 * failing the whole provider (mirrors the inventory provider's philosophy:
 * pagination/query integrity failures fail the provider, but a single bad
 * business-data row does not).
 */

export interface QualifyingHighUrgencyTaskSource {
  taskId: string;
  title: string | null;
  /** Calendar-validated YYYY-MM-DD, never a raw/unvalidated string. */
  validatedDateKey: string;
  createdTime: string | null;
}

/** `true`/`false` only — anything else (a stray non-boolean value coming
 *  through from a loosely-typed Supabase response) is treated as
 *  malformed rather than coerced into a boolean. */
function isMalformedCompletionFlag(value: unknown): boolean {
  return value !== null && value !== undefined && typeof value !== 'boolean';
}

export function extractQualifyingHighUrgencyTaskSource(task: TodoSnapshotTask): QualifyingHighUrgencyTaskSource | null {
  if (!task.id) return null;

  if (isMalformedCompletionFlag(task.completed) || isMalformedCompletionFlag(task.is_completed)) return null;
  if (task.completed === true || task.is_completed === true) return null;

  if (task.status !== null && task.status !== undefined && typeof task.status !== 'string') return null;
  const normalizedStatus = typeof task.status === 'string' ? task.status.trim().toLowerCase() : '';
  if (normalizedStatus === 'done') return null;

  if (task.urgency !== null && task.urgency !== undefined && typeof task.urgency !== 'string') return null;
  const normalizedUrgency = typeof task.urgency === 'string' ? task.urgency.trim().toUpperCase() : '';
  if (normalizedUrgency !== 'HIGH') return null;

  const validatedDateKey = toValidatedDateKey(task.date);
  if (!validatedDateKey) return null;

  return {
    taskId: task.id,
    title: task.title,
    validatedDateKey,
    createdTime: task.created_at,
  };
}

// Lexicographically greater than any real ISO-8601 timestamp string (which
// only ever uses ASCII digits/`-`/`:`/`.`/`T`/`Z`), used as the sentinel
// sort key for a missing/malformed `created_at`. Built via `fromCharCode`
// (U+FFFF) rather than a literal character so this file stays plain ASCII.
const MISSING_CREATED_TIME_SORT_SENTINEL = String.fromCharCode(0xffff);

function createdTimeSortKey(createdTime: string | null): string {
  return createdTime || MISSING_CREATED_TIME_SORT_SENTINEL;
}

/**
 * Shared `created_at` → task-id tie-break for both the P0 and P2
 * evaluators. A missing/malformed `created_at` is deliberately sorted
 * *after* every real timestamp (via the sentinel above) rather than being
 * treated as `''`, which would otherwise sort before every real timestamp
 * and let a data gap silently win a priority tie it has no real claim to.
 * The final task-id comparison guarantees a fully deterministic result
 * regardless of `created_at` — Supabase response order is never relied on.
 */
export function compareByCreatedTimeThenTaskId(
  a: QualifyingHighUrgencyTaskSource,
  b: QualifyingHighUrgencyTaskSource
): number {
  const aCreated = createdTimeSortKey(a.createdTime);
  const bCreated = createdTimeSortKey(b.createdTime);
  if (aCreated !== bCreated) return aCreated < bCreated ? -1 : 1;

  return a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0;
}
