import {
  addCalendarDaysToDateKey,
  daysBetweenDateKeys,
  isWithinInclusiveDateWindow,
  toCalendarDateKey,
} from '../dateUtils';
import { getInventoryAppRoute } from '../knownRoutes';
import { DIALOGUE_ID, PET_DIALOGUE_RULE_VERSION } from '../types';
import type { DialogueCandidate, InsightCandidate } from '../types';
import type { InventorySnapshot, InventorySnapshotBatch, InventorySnapshotItem } from './inventorySnapshotProvider';

/** See expiredInventoryProvider.ts's ExpiredInventoryFacts for the same
 *  design intent. */
export interface ExpiringSoonInventoryFacts {
  itemId: string;
  itemName: string | null;
  quantity: number;
  expiryDate: string;
  daysRemaining: number;
  windowDays: number;
  batchId?: string;
}

/**
 * Pure P2 (inventory expiring soon) evaluation over the same
 * InventorySnapshot P0 uses — no second Supabase fetch. Mirrors the P0
 * batch-authoritative structure in expiredInventoryProvider.ts (an item
 * with any batch records is evaluated on batch data only; an item with none
 * falls back to its own expiry field) but with the expiring-soon date
 * window instead of the expired-before-today check.
 *
 * Runs last in the same-item precedence chain (expired → low stock →
 * expiring soon — see inventorySnapshotProvider.ts): excludes any item that
 * already qualified for P0, and any item that already qualified for Low
 * Stock (Low Stock now outranks Expiring Soon for the same item — see
 * lowStockInventoryProvider.ts).
 */

export const INVENTORY_EXPIRING_SOON_DAYS = 30;

/** A single item's qualifying expiring-soon source — either its earliest
 *  qualifying batch, or (only when it has no batch rows at all) the item's
 *  own legacy expiry field. */
interface ExpiringSoonSource {
  kind: 'batch' | 'item';
  itemId: string;
  itemName: string | null;
  expiryDate: string;
  createdTime: string | null;
  batchId?: string;
  /** Same intent as expiredInventoryProvider.ts's ExpiredSource.quantity —
   *  the already-checked (>0) qty this source qualified on, carried through
   *  purely for facts exposure. */
  quantity: number;
}

function toNumber(value: number | string | null): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function compareBatchesForSelection(a: InventorySnapshotBatch, b: InventorySnapshotBatch): number {
  const aExpiry = a.expiry_date ?? '';
  const bExpiry = b.expiry_date ?? '';
  if (aExpiry !== bExpiry) return aExpiry < bExpiry ? -1 : 1;

  const aCreated = a.created_at ?? '';
  const bCreated = b.created_at ?? '';
  if (aCreated !== bCreated) return aCreated < bCreated ? -1 : 1;

  return String(a.id) < String(b.id) ? -1 : 1;
}

function selectExpiringSoonSourceForItem(
  item: InventorySnapshotItem,
  itemBatches: InventorySnapshotBatch[] | undefined,
  todayKey: string,
  windowEndKey: string
): ExpiringSoonSource | null {
  if (itemBatches && itemBatches.length > 0) {
    // Batch-authoritative, same as P0: an item with any batch rows is
    // evaluated purely on batch data, never item-level fields.
    const qualifying = itemBatches.filter(
      (b) => toNumber(b.qty) > 0 && isWithinInclusiveDateWindow(b.expiry_date, todayKey, windowEndKey)
    );
    if (qualifying.length === 0) return null;

    const earliest = [...qualifying].sort(compareBatchesForSelection)[0];
    return {
      kind: 'batch',
      itemId: item.id,
      itemName: item.name,
      expiryDate: earliest.expiry_date as string,
      createdTime: earliest.created_at,
      batchId: earliest.id,
      quantity: toNumber(earliest.qty),
    };
  }

  // No batch rows at all — legacy item-level fallback.
  if (toNumber(item.quantity) > 0 && isWithinInclusiveDateWindow(item.expiry_date, todayKey, windowEndKey)) {
    return {
      kind: 'item',
      itemId: item.id,
      itemName: item.name,
      expiryDate: item.expiry_date as string,
      createdTime: item.created_at,
      quantity: toNumber(item.quantity),
    };
  }

  return null;
}

function compareSourcesForSelection(a: ExpiringSoonSource, b: ExpiringSoonSource): number {
  if (a.expiryDate !== b.expiryDate) return a.expiryDate < b.expiryDate ? -1 : 1;

  const aCreated = a.createdTime ?? '';
  const bCreated = b.createdTime ?? '';
  if (aCreated !== bCreated) return aCreated < bCreated ? -1 : 1;

  if (a.itemId !== b.itemId) return a.itemId < b.itemId ? -1 : 1;

  const aBatch = a.batchId ?? '';
  const bBatch = b.batchId ?? '';
  return aBatch < bBatch ? -1 : aBatch > bBatch ? 1 : 0;
}

function buildMessage(safeName: string | null, daysRemaining: number): string {
  if (daysRemaining === 0) {
    return safeName ? `${safeName} expires today. Please review it.` : 'An inventory item expires today. Please review it.';
  }
  if (daysRemaining === 1) {
    return safeName
      ? `${safeName} will expire tomorrow. Please review it.`
      : 'An inventory item will expire tomorrow. Please review it.';
  }
  return safeName
    ? `${safeName} will expire in ${daysRemaining} days. Please review it.`
    : `An inventory item will expire in ${daysRemaining} days. Please review it.`;
}

function buildCandidateFromSource(source: ExpiringSoonSource, todayKey: string): InsightCandidate<ExpiringSoonInventoryFacts> {
  const safeName = typeof source.itemName === 'string' && source.itemName.trim().length > 0 ? source.itemName.trim() : null;
  const daysRemaining = Math.max(0, daysBetweenDateKeys(todayKey, source.expiryDate));
  const message = buildMessage(safeName, daysRemaining);
  // buildMessage has three wordings (today/tomorrow/N days) selected purely
  // by `daysRemaining`, which is already exposed in `facts` below — one
  // canonical placeholder template covers all three without altering any of
  // them.
  const messageTemplate = '{itemName} will expire in {daysRemaining} days. Please review it.';

  const dedupeKey =
    source.kind === 'batch'
      ? `inventory_expiring_soon:${source.itemId}:batch:${source.batchId}:${source.expiryDate}:window30`
      : `inventory_expiring_soon:${source.itemId}:item:${source.expiryDate}:window30`;

  const evaluatedAt = new Date().toISOString();
  const facts: ExpiringSoonInventoryFacts = {
    itemId: source.itemId,
    itemName: source.itemName,
    quantity: source.quantity,
    expiryDate: source.expiryDate,
    daysRemaining,
    windowDays: INVENTORY_EXPIRING_SOON_DAYS,
    ...(source.kind === 'batch' ? { batchId: source.batchId } : {}),
  };

  return {
    app: 'inventory',
    triggerId: DIALOGUE_ID.INVENTORY_EXPIRING_SOON,
    facts,
    messageTemplate,
    sourceRecordId: source.itemId,
    evaluatedAt,
    userState: 'ACTIVE_USER_URGENT',
    dialogueId: DIALOGUE_ID.INVENTORY_EXPIRING_SOON,
    priority: 'P2',
    message,
    action: { label: 'Check Inventory', route: getInventoryAppRoute() },
    source: {
      app: 'inventory',
      recordId: source.itemId,
      evaluatedAt,
      // Internal provenance only — never rendered in the UI.
      ...(source.kind === 'batch' ? { batchId: source.batchId } : {}),
    },
    dedupeKey,
    ruleVersion: PET_DIALOGUE_RULE_VERSION,
    // Unlike P0, P1 neither bypasses the entry walk nor auto-closes — it
    // waits like any ordinary dialogue and stays until dismissed/acted on.
    eventTime: source.expiryDate,
    createdTime: source.createdTime ?? undefined,
    recordId: source.itemId,
  };
}

export interface ExpiringSoonInventoryEvaluation {
  candidate: DialogueCandidate | null;
  /** Every independently eligible Expiring Soon candidate, in the same
   *  business order compareSourcesForSelection already produces —
   *  `candidates[0]` is always identical to `candidate` above. Additive
   *  only. */
  candidates: DialogueCandidate[];
  /** Every item id with at least one qualifying expiring-soon (P1) source —
   *  batch or legacy item-level, not just the globally-selected winner. The
   *  Low Stock evaluator excludes all of these: an item already flagged as
   *  expiring soon must never also downgrade into a Low Stock candidate,
   *  independent of whether this candidate was the global P1 winner or was
   *  already dismissed/handled in the current session. */
  expiringSoonItemIds: Set<string>;
}

/**
 * `excludedItemIds` is the union of expired (P0) and low-stock (P2)
 * qualifying item ids — an item already flagged by either of those must
 * never also produce an Expiring Soon candidate, even if a different batch
 * on that same item would otherwise qualify.
 */
export function evaluateExpiringSoonInventory(
  snapshot: InventorySnapshot,
  excludedItemIds: Set<string>,
  now: Date = new Date()
): ExpiringSoonInventoryEvaluation {
  const todayKey = toCalendarDateKey(now);
  const windowEndKey = addCalendarDaysToDateKey(todayKey, INVENTORY_EXPIRING_SOON_DAYS);

  const sources: ExpiringSoonSource[] = [];
  for (const item of snapshot.items) {
    if (excludedItemIds.has(item.id)) continue;
    const source = selectExpiringSoonSourceForItem(item, snapshot.batchesByItem.get(item.id), todayKey, windowEndKey);
    if (source) sources.push(source);
  }

  if (sources.length === 0) {
    return { candidate: null, candidates: [], expiringSoonItemIds: new Set() };
  }

  const ordered = [...sources].sort(compareSourcesForSelection);
  const candidates = ordered.map((source) => buildCandidateFromSource(source, todayKey));
  return {
    candidate: candidates[0] ?? null,
    candidates,
    expiringSoonItemIds: new Set(sources.map((s) => s.itemId)),
  };
}
