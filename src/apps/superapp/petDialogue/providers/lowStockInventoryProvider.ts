import { getInventoryAppRoute } from '../knownRoutes';
import { DIALOGUE_ID, PET_DIALOGUE_RULE_VERSION } from '../types';
import type { DialogueCandidate, InsightCandidate } from '../types';
import type { InventorySnapshot, InventorySnapshotItem } from './inventorySnapshotProvider';

/** See expiredInventoryProvider.ts's ExpiredInventoryFacts for the same
 *  design intent — a pure exposure of values already computed by
 *  selectLowStockSourceForItem below, never a new calculation. */
export interface LowStockInventoryFacts {
  itemId: string;
  itemName: string | null;
  quantity: number;
  threshold: number;
}

/**
 * Pure P2 (low stock) evaluation over the same InventorySnapshot P0/expiring
 * soon use — no second Supabase fetch. Unlike those two, Low Stock is
 * evaluated purely from `inventory_items.quantity`: the Inventory app
 * already recalculates that column as the sum of `inventory_item_batches.qty`
 * whenever batches change, so it's already the authoritative total — this
 * evaluator must not re-sum batches itself.
 *
 * Runs second in the same-item precedence chain (expired → low stock →
 * expiring soon — see inventorySnapshotProvider.ts), so it exposes its full
 * qualifying item-id set the same way expired/expiring-soon do: the
 * expiring-soon evaluator excludes every item already flagged here, not
 * just this evaluator's own global winner.
 */

export const INVENTORY_LOW_STOCK_THRESHOLD = 10;

interface LowStockSource {
  itemId: string;
  itemName: string | null;
  quantity: number;
  createdTime: string | null;
}

/**
 * Strict finite-number parse — deliberately does NOT fall back to 0 the way
 * other inventory evaluators' `toNumber` helpers do (0 already fails the
 * qualifying range here, but silently coercing a malformed/non-numeric
 * `quantity` value would misrepresent unusable data as "confirmed zero").
 * Returns null for anything that isn't a genuine finite number, and the
 * caller skips the row entirely rather than guessing.
 *
 * Blank/whitespace-only strings are rejected explicitly before the `Number()`
 * coercion: `Number('')` and `Number('   ')` both evaluate to `0` in
 * JavaScript, which would otherwise silently turn "no usable value" into a
 * confirmed-zero quantity instead of an unparseable one.
 */
function parseFiniteQuantity(value: number | string | null): number | null {
  if (value === null) return null;
  if (typeof value === 'string' && value.trim().length === 0) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function selectLowStockSourceForItem(item: InventorySnapshotItem): LowStockSource | null {
  const quantity = parseFiniteQuantity(item.quantity);
  if (quantity === null) return null;
  if (quantity < 1 || quantity > INVENTORY_LOW_STOCK_THRESHOLD) return null;

  return {
    itemId: item.id,
    itemName: item.name,
    quantity,
    createdTime: item.created_at,
  };
}

function compareSourcesForSelection(a: LowStockSource, b: LowStockSource): number {
  if (a.quantity !== b.quantity) return a.quantity - b.quantity;

  const aCreated = a.createdTime ?? '';
  const bCreated = b.createdTime ?? '';
  if (aCreated !== bCreated) return aCreated < bCreated ? -1 : 1;

  return a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0;
}

function buildCandidateFromSource(source: LowStockSource): InsightCandidate<LowStockInventoryFacts> {
  const safeName = typeof source.itemName === 'string' && source.itemName.trim().length > 0 ? source.itemName.trim() : null;
  const message = safeName ? `${safeName} is nearly out of stock.` : 'An inventory item is nearly out of stock.';
  const messageTemplate = '{itemName} is nearly out of stock.';

  // Quantity is part of the dedupe key (not the message) so a materially
  // changed stock level — e.g. dropping further — is treated as a new
  // condition and can appear again, while an unchanged quantity stays
  // suppressed for the rest of the tab session.
  const dedupeKey = `inventory_low_stock:${source.itemId}:quantity:${source.quantity}:threshold${INVENTORY_LOW_STOCK_THRESHOLD}`;

  const evaluatedAt = new Date().toISOString();
  const facts: LowStockInventoryFacts = {
    itemId: source.itemId,
    itemName: source.itemName,
    quantity: source.quantity,
    threshold: INVENTORY_LOW_STOCK_THRESHOLD,
  };

  return {
    app: 'inventory',
    triggerId: DIALOGUE_ID.INVENTORY_LOW_STOCK,
    facts,
    messageTemplate,
    sourceRecordId: source.itemId,
    evaluatedAt,
    userState: 'ACTIVE_USER_URGENT',
    dialogueId: DIALOGUE_ID.INVENTORY_LOW_STOCK,
    priority: 'P2',
    message,
    action: { label: 'Check Inventory', route: getInventoryAppRoute() },
    source: {
      app: 'inventory',
      recordId: source.itemId,
      evaluatedAt,
    },
    dedupeKey,
    ruleVersion: PET_DIALOGUE_RULE_VERSION,
    // No bypassEntryWalk (only P0 does that) and no autoCloseMs (only the
    // fixed fallback does that) — Low Stock behaves like an ordinary
    // dialogue: waits for the entry walk, stays until dismissed/acted on.
    createdTime: source.createdTime ?? undefined,
    recordId: source.itemId,
  };
}

export interface LowStockInventoryEvaluation {
  candidate: DialogueCandidate | null;
  /** Every independently eligible Low Stock candidate, in the same business
   *  order compareSourcesForSelection already produces — `candidates[0]` is
   *  always identical to `candidate` above. Additive only. */
  candidates: DialogueCandidate[];
  /** Every item id with at least one qualifying low-stock source, not just
   *  the globally-selected winner — the expiring-soon evaluator excludes
   *  all of these, since low stock now outranks expiring soon for the same
   *  item (see inventorySnapshotProvider.ts). */
  lowStockItemIds: Set<string>;
}

/**
 * `excludedItemIds` is the expired (P0) qualifying item-id set — an item
 * already flagged as expired must never also produce a Low Stock
 * candidate, regardless of session-handled state for that P0 candidate.
 */
export function evaluateLowStockInventory(
  snapshot: InventorySnapshot,
  excludedItemIds: Set<string>
): LowStockInventoryEvaluation {
  const sources: LowStockSource[] = [];
  for (const item of snapshot.items) {
    if (excludedItemIds.has(item.id)) continue;
    const source = selectLowStockSourceForItem(item);
    if (source) sources.push(source);
  }

  if (sources.length === 0) {
    return { candidate: null, candidates: [], lowStockItemIds: new Set() };
  }

  const ordered = [...sources].sort(compareSourcesForSelection);
  const candidates = ordered.map(buildCandidateFromSource);
  return {
    candidate: candidates[0] ?? null,
    candidates,
    lowStockItemIds: new Set(sources.map((s) => s.itemId)),
  };
}
