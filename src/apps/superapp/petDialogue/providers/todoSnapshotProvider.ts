import { getSuperappHostDependencies } from '../../dependencies';
import type { CandidateProviderFailureReason, CandidateProviderResult, DialogueCandidate } from '../types';
import { evaluateOverdueHighTask } from './overdueTaskProvider';
import { evaluateHighTaskToday } from './taskTodayProvider';

/**
 * Fetches the current authenticated user's own `public.tasks` rows.
 * Deliberately does NOT filter by `.eq('user_id', userId)`: production RLS
 * on `public.tasks` (`tasks_select_own`, validated live) already enforces
 * `auth.uid() = user_id` as the sole authorization boundary, and removing
 * the client-side filter was specifically tested to still return only the
 * authenticated user's own rows — an anonymous or unrelated session gets
 * zero rows regardless of what this query asks for. `userId` is still
 * required to gate the call (no session → no query) and for the caller's
 * own de-duplication scoping, just not as an authorization filter here —
 * mirrors the identical, already-reviewed inventorySnapshotProvider.ts
 * pattern.
 *
 * This is the single shared fetch both P0 (overdue High task) and P2 (High
 * task due today) are derived from.
 */

export interface TodoSnapshotTask {
  id: string;
  title: string | null;
  status: string | null;
  urgency: string | null;
  date: string | null;
  completed: boolean | null;
  is_completed: boolean | null;
  created_at: string | null;
}

export interface TodoSnapshot {
  tasks: TodoSnapshotTask[];
}

export interface TodoDialogueEvaluation {
  overdueCandidate: DialogueCandidate | null;
  taskTodayCandidate: DialogueCandidate | null;
  /** Ordered candidate pools, additive alongside the single-winner fields
   *  above — `overdueCandidates[0] === overdueCandidate`, etc. See
   *  overdueTaskProvider.ts / taskTodayProvider.ts for the ordering each
   *  preserves. */
  overdueCandidates: DialogueCandidate[];
  taskTodayCandidates: DialogueCandidate[];
}

const TASK_PAGE_SIZE = 200;
// Safety net against a runaway/non-advancing pagination loop, not a
// correctness truncation — hitting it fails the evaluation rather than
// silently returning a partial task set. 50 pages * 200 rows = 10,000
// tasks, far beyond any real account's task list today.
const MAX_TASK_PAGES = 50;
const PROVIDER_TIMEOUT_MS = 10_000;

/** Thrown internally to carry a specific, typed failure reason up to the
 *  single catch site in fetchTodoSnapshot. Never allowed to escape this
 *  module. */
class ProviderFailure extends Error {
  readonly reason: CandidateProviderFailureReason;
  constructor(reason: CandidateProviderFailureReason) {
    super(`[petDialogue] todo snapshot failure: ${reason}`);
    this.reason = reason;
  }
}

function isAbortLikeError(err: unknown): boolean {
  return (err as { name?: string })?.name === 'AbortError';
}

/**
 * Fetches every task visible to the current session via deterministic
 * keyset pagination (ordered by `id` ascending, no arbitrary total-row
 * cap). Any of the following is treated as a failure (never a
 * silently-truncated success): a page query error, a cursor that fails to
 * advance, a missing row id, a duplicate id across pages, or exceeding
 * MAX_TASK_PAGES.
 */
async function fetchAllVisibleTasks(signal: AbortSignal): Promise<TodoSnapshotTask[]> {
  const { supabase } = getSuperappHostDependencies();
  const tasks: TodoSnapshotTask[] = [];
  const seenIds = new Set<string>();
  let cursor: string | null = null;
  let pageCount = 0;

  for (;;) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    if (pageCount >= MAX_TASK_PAGES) {
      throw new ProviderFailure('pagination_incomplete');
    }
    pageCount += 1;

    let query = supabase
      .from('tasks')
      .select('id, title, status, urgency, date, completed, is_completed, created_at')
      .order('id', { ascending: true })
      .limit(TASK_PAGE_SIZE);

    if (cursor !== null) {
      query = query.gt('id', cursor);
    }

    const { data, error } = await query.abortSignal(signal);
    if (error) throw new ProviderFailure('item_query_failed');

    const page = (data || []) as TodoSnapshotTask[];
    if (page.length === 0) break;

    const lastId = page[page.length - 1]?.id;
    if (!lastId) throw new ProviderFailure('unexpected_data');

    // `.gt('id', cursor)` should guarantee this server-side; re-checked here
    // as a defensive invariant rather than trusted blindly.
    if (cursor !== null && !(lastId > cursor)) {
      throw new ProviderFailure('pagination_incomplete');
    }

    for (const task of page) {
      if (!task.id) throw new ProviderFailure('unexpected_data');
      if (seenIds.has(task.id)) {
        // A duplicate id across pages means pagination can't be trusted;
        // fail closed rather than risk under- or double-counting.
        throw new ProviderFailure('unexpected_data');
      }
      seenIds.add(task.id);
      tasks.push(task);
    }

    cursor = lastId;

    if (page.length < TASK_PAGE_SIZE) break; // final partial page — done
  }

  return tasks;
}

async function fetchTodoSnapshot(userId: string, signal?: AbortSignal): Promise<CandidateProviderResult<TodoSnapshot>> {
  if (!userId) return { status: 'success', candidate: { tasks: [] } };

  // Same timeout/abort disambiguation as inventorySnapshotProvider.ts: an
  // external abort (unmount/logout/newer-generation) must resolve as
  // `aborted` (apply no result), while a request that's simply taking too
  // long must resolve as `failed` with reason 'timeout' (show the neutral
  // fallback).
  const internalController = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => internalController.abort();
  if (signal) {
    if (signal.aborted) internalController.abort();
    else signal.addEventListener('abort', onExternalAbort);
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    internalController.abort();
  }, PROVIDER_TIMEOUT_MS);

  try {
    const tasks = await fetchAllVisibleTasks(internalController.signal);
    return { status: 'success', candidate: { tasks } };
  } catch (err) {
    if (isAbortLikeError(err)) {
      if (signal?.aborted) return { status: 'aborted' };
      if (timedOut) return { status: 'failed', reason: 'timeout' };
      return { status: 'aborted' };
    }
    if (err instanceof ProviderFailure) {
      return { status: 'failed', reason: err.reason };
    }
    console.warn('[petDialogue] todo snapshot fetch failed unexpectedly');
    return { status: 'failed', reason: 'unexpected_data' };
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Single hook-facing entry point: fetches the Todo snapshot once, then
 * derives the P0 (overdue High task) and P2 (High task due today)
 * candidates from it. Neither ever triggers a second complete tasks fetch.
 * The two are mutually exclusive by date comparison inside their own
 * evaluators, so no cross-evaluator exclusion set is threaded here (unlike
 * the inventory P0/P1/low-stock chain).
 */
export async function fetchTodoDialogueEvaluation(
  userId: string,
  localToday: string,
  signal?: AbortSignal
): Promise<CandidateProviderResult<TodoDialogueEvaluation>> {
  const snapshotResult = await fetchTodoSnapshot(userId, signal);
  if (snapshotResult.status !== 'success') return snapshotResult;

  const snapshot = snapshotResult.candidate ?? { tasks: [] };

  const { candidate: overdueCandidate, candidates: overdueCandidates } = evaluateOverdueHighTask(snapshot, localToday);
  const { candidate: taskTodayCandidate, candidates: taskTodayCandidates } = evaluateHighTaskToday(snapshot, localToday);

  return {
    status: 'success',
    candidate: { overdueCandidate, taskTodayCandidate, overdueCandidates, taskTodayCandidates },
  };
}
