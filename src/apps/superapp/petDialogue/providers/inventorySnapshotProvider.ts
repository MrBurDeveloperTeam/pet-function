import { getSuperappHostDependencies } from '../../dependencies';
import type { CandidateProviderFailureReason, CandidateProviderResult, DialogueCandidate } from '../types';
import { evaluateExpiredInventory } from './expiredInventoryProvider';
import { evaluateExpiringSoonInventory } from './expiringSoonInventoryProvider';
import { evaluateLowStockInventory } from './lowStockInventoryProvider';

/**
 * Fetches the complete inventory dataset visible to the current
 * authenticated Supabase session — the owner's own inventory, plus anything
 * shared with them as a `collaborators` member. Deliberately does NOT filter
 * by `.eq('user_id', userId)` (or query `collaborators` directly): live RLS
 * on `inventory_items` / `inventory_item_batches` already enforces "owner OR
 * valid collaborator of the owner" as a server-side policy, and live testing
 * (see the Phase 1A RLS verification report) confirmed that removing the
 * client-side user_id filter still returns only rows the authenticated user
 * is authorized to see — an anonymous or unrelated session gets zero rows
 * regardless of what this query asks for. `userId` is still required and
 * still used to gate the call (no session → no query) and for the caller's
 * own de-duplication scoping, just not as an authorization filter here.
 *
 * This is the single shared fetch both P0 (expired) and P1 (expiring soon)
 * are derived from — see evaluateExpiredInventory / evaluateExpiringSoonInventory.
 * It never throws for a normal query/data problem and never silently
 * returns "no data" for one either — see CandidateProviderResult in
 * ../types. A `failed` result must cause callers to treat both P0 and P1 as
 * unknown (never as "nothing urgent exists").
 */

export interface InventorySnapshotItem {
  id: string;
  name: string | null;
  quantity: number | string | null;
  expiry_date: string | null;
  created_at: string | null;
}

export interface InventorySnapshotBatch {
  id: string;
  item_id: string;
  qty: number | string | null;
  expiry_date: string | null;
  created_at: string | null;
}

export interface InventorySnapshot {
  items: InventorySnapshotItem[];
  batchesByItem: Map<string, InventorySnapshotBatch[]>;
}

export interface InventoryDialogueEvaluation {
  expiredCandidate: DialogueCandidate | null;
  expiringSoonCandidate: DialogueCandidate | null;
  lowStockCandidate: DialogueCandidate | null;
  /** Ordered candidate pools, additive alongside the single-winner fields
   *  above — `expiredCandidates[0] === expiredCandidate`, etc. See
   *  expiredInventoryProvider.ts / lowStockInventoryProvider.ts /
   *  expiringSoonInventoryProvider.ts for the ordering each preserves. */
  expiredCandidates: DialogueCandidate[];
  expiringSoonCandidates: DialogueCandidate[];
  lowStockCandidates: DialogueCandidate[];
}

const ITEM_PAGE_SIZE = 200;
// Safety net against a runaway/non-advancing pagination loop, not a
// correctness truncation — hitting it fails the evaluation rather than
// silently returning a partial item set. 50 pages * 200 rows = 10,000
// items, far beyond any real account's visible inventory today.
const MAX_ITEM_PAGES = 50;
const BATCH_ITEM_ID_CHUNK_SIZE = 50;
// Under the MAX_ITEM_PAGES safety cap (10,000 items), the batch fetch could
// otherwise need up to 200 chunk requests — firing all of them at once via
// a bare Promise.all would be a disproportionate concurrent-request burst
// for what's meant to be a defensive edge case, not the common path (today's
// real inventory sizes are far smaller). Bounded to a small, fixed worker
// pool instead — see runWithConcurrencyLimit.
const BATCH_CHUNK_CONCURRENCY = 8;
const PROVIDER_TIMEOUT_MS = 10_000;

/** Thrown internally to carry a specific, typed failure reason up to the
 *  single catch site in fetchInventorySnapshot. Never allowed to escape
 *  this module. */
class ProviderFailure extends Error {
  readonly reason: CandidateProviderFailureReason;
  constructor(reason: CandidateProviderFailureReason) {
    super(`[petDialogue] inventory snapshot failure: ${reason}`);
    this.reason = reason;
  }
}

function isAbortLikeError(err: unknown): boolean {
  return (err as { name?: string })?.name === 'AbortError';
}

function toChunks<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Runs `tasks` with at most `limit` in flight at once, preserving each
 * task's result at its original index. Rejects as soon as any task rejects
 * (same fail-fast semantics as Promise.all — a failed batch chunk still
 * invalidates the whole snapshot immediately) without waiting for the rest
 * of that task's still-in-flight siblings, which the caller's
 * AbortController/timeout are responsible for eventually settling. No
 * dependency: a small fixed-size worker pool over a shared cursor.
 */
async function runWithConcurrencyLimit<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = nextIndex++;
      if (i >= tasks.length) return;
      results[i] = await tasks[i]();
    }
  }

  const workerCount = Math.max(1, Math.min(limit, tasks.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

/**
 * Fetches every inventory item visible to the current session via
 * deterministic keyset pagination (ordered by `id` ascending, no arbitrary
 * total-row cap). An item with batches is evaluated purely on batch data —
 * its own `quantity`/`expiry_date` may be stale or unset — so this
 * deliberately applies no quantity/expiry filter either; filtering here
 * could hide a real batch-derived P0 or P1.
 *
 * Any of the following is treated as a failure (never a silently-truncated
 * success): a page query error, a cursor that fails to advance, a missing
 * row id, a duplicate id across pages, or exceeding MAX_ITEM_PAGES.
 */
async function fetchAllVisibleInventoryItems(signal: AbortSignal): Promise<InventorySnapshotItem[]> {
  const { supabase } = getSuperappHostDependencies();
  const items: InventorySnapshotItem[] = [];
  const seenIds = new Set<string>();
  let cursor: string | null = null;
  let pageCount = 0;

  for (;;) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    if (pageCount >= MAX_ITEM_PAGES) {
      throw new ProviderFailure('pagination_incomplete');
    }
    pageCount += 1;

    let query = supabase
      .from('inventory_items')
      .select('id, name, quantity, expiry_date, created_at')
      .order('id', { ascending: true })
      .limit(ITEM_PAGE_SIZE);

    if (cursor !== null) {
      query = query.gt('id', cursor);
    }

    const { data, error } = await query.abortSignal(signal);
    if (error) throw new ProviderFailure('item_query_failed');

    const page = (data || []) as InventorySnapshotItem[];
    if (page.length === 0) break;

    const lastId = page[page.length - 1]?.id;
    if (!lastId) throw new ProviderFailure('unexpected_data');

    // `.gt('id', cursor)` should guarantee this server-side; re-checked here
    // as a defensive invariant rather than trusted blindly.
    if (cursor !== null && !(lastId > cursor)) {
      throw new ProviderFailure('pagination_incomplete');
    }

    for (const item of page) {
      if (!item.id) throw new ProviderFailure('unexpected_data');
      if (seenIds.has(item.id)) {
        // A duplicate id across pages — identical or conflicting values —
        // means pagination can't be trusted; fail closed rather than risk
        // under- or double-counting.
        throw new ProviderFailure('unexpected_data');
      }
      seenIds.add(item.id);
      items.push(item);
    }

    cursor = lastId;

    if (page.length < ITEM_PAGE_SIZE) break; // final partial page — done
  }

  return items;
}

/**
 * Fetches every batch row for the given item IDs, chunked to keep each
 * request small. No qty/expiry filter: an unfiltered result is also how we
 * know an item HAS batches at all (see the evaluators) — pre-filtering to
 * only qualifying rows would make "has batches, none qualify" indistinguishable
 * from "no batches", incorrectly falling through to the legacy item-level
 * path. Any failed chunk fails the whole evaluation — partial batch data is
 * never used to compute a candidate.
 */
async function fetchBatchesForItems(itemIds: string[], signal: AbortSignal): Promise<InventorySnapshotBatch[]> {
  const { supabase } = getSuperappHostDependencies();
  if (itemIds.length === 0) return [];

  const chunks = toChunks(itemIds, BATCH_ITEM_ID_CHUNK_SIZE);
  const results = await runWithConcurrencyLimit(
    chunks.map((chunk) => async () => {
      const { data, error } = await supabase
        .from('inventory_item_batches')
        .select('id, item_id, qty, expiry_date, created_at')
        .in('item_id', chunk)
        .abortSignal(signal);

      if (error) throw new ProviderFailure('batch_query_failed');
      return (data || []) as InventorySnapshotBatch[];
    }),
    BATCH_CHUNK_CONCURRENCY
  );

  return results.flat();
}

function groupBatchesByItem(
  batches: InventorySnapshotBatch[],
  validItemIds: Set<string>
): Map<string, InventorySnapshotBatch[]> {
  const map = new Map<string, InventorySnapshotBatch[]>();
  for (const batch of batches) {
    if (!batch.item_id || !validItemIds.has(batch.item_id)) {
      // A batch referencing an item outside the fetched item set indicates
      // the item/batch fetches are out of sync with each other — fail
      // rather than silently evaluate against an incomplete picture.
      throw new ProviderFailure('unexpected_data');
    }
    const list = map.get(batch.item_id);
    if (list) list.push(batch);
    else map.set(batch.item_id, [batch]);
  }
  return map;
}

async function fetchInventorySnapshot(
  userId: string,
  signal?: AbortSignal
): Promise<CandidateProviderResult<InventorySnapshot>> {
  if (!userId) return { status: 'success', candidate: { items: [], batchesByItem: new Map() } };

  // A real, active-request timeout distinct from the caller's own
  // AbortController: unmount/logout/newer-generation cancellation must
  // resolve as `aborted` (apply no result), while a request that's simply
  // taking too long must resolve as `failed` with reason 'timeout' (show
  // the neutral fallback) — the two need to be told apart even though both
  // ultimately abort the same in-flight Supabase requests.
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
    const items = await fetchAllVisibleInventoryItems(internalController.signal);
    if (items.length === 0) return { status: 'success', candidate: { items: [], batchesByItem: new Map() } };

    const itemIds = items.map((i) => i.id);
    const validItemIds = new Set(itemIds);

    const batches = await fetchBatchesForItems(itemIds, internalController.signal);
    const batchesByItem = groupBatchesByItem(batches, validItemIds);

    return { status: 'success', candidate: { items, batchesByItem } };
  } catch (err) {
    if (isAbortLikeError(err)) {
      // A real external cancellation always wins over an incidental
      // same-moment timeout — it reflects genuine intent (unmount, logout,
      // user change, superseded generation) to discard this evaluation.
      if (signal?.aborted) return { status: 'aborted' };
      if (timedOut) return { status: 'failed', reason: 'timeout' };
      return { status: 'aborted' };
    }
    if (err instanceof ProviderFailure) {
      return { status: 'failed', reason: err.reason };
    }
    console.warn('[petDialogue] inventory snapshot fetch failed unexpectedly');
    return { status: 'failed', reason: 'unexpected_data' };
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Single hook-facing entry point: fetches the inventory snapshot once, then
 * derives the P0 (expired), P2 (low stock), and P2 (expiring soon)
 * candidates from it. None of the three ever trigger a second complete
 * item/batch fetch.
 *
 * Same-item precedence (expired > low stock > expiring soon — the approved
 * priority-order change) is enforced here by threading each evaluator's
 * full qualifying-item-id set into the next: expiring soon excludes the
 * union of expired and low-stock item ids, not just their global winners,
 * and independent of session-handled state (that's applied later, per
 * candidate, in the hook).
 */
export async function fetchInventoryDialogueEvaluation(
  userId: string,
  signal?: AbortSignal
): Promise<CandidateProviderResult<InventoryDialogueEvaluation>> {
  const snapshotResult = await fetchInventorySnapshot(userId, signal);
  if (snapshotResult.status !== 'success') return snapshotResult;

  const snapshot = snapshotResult.candidate ?? { items: [], batchesByItem: new Map() };

  const { candidate: expiredCandidate, candidates: expiredCandidates, expiredItemIds } = evaluateExpiredInventory(snapshot);
  const {
    candidate: lowStockCandidate,
    candidates: lowStockCandidates,
    lowStockItemIds,
  } = evaluateLowStockInventory(snapshot, expiredItemIds);
  const expiringSoonExcludedItemIds = new Set([...expiredItemIds, ...lowStockItemIds]);
  const { candidate: expiringSoonCandidate, candidates: expiringSoonCandidates } = evaluateExpiringSoonInventory(
    snapshot,
    expiringSoonExcludedItemIds
  );

  return {
    status: 'success',
    candidate: {
      expiredCandidate,
      expiringSoonCandidate,
      lowStockCandidate,
      expiredCandidates,
      expiringSoonCandidates,
      lowStockCandidates,
    },
  };
}
