import { isExpiredBeforeToday } from '../dateUtils';
import { getInventoryAppRoute } from '../knownRoutes';
import { DIALOGUE_ID, PET_DIALOGUE_RULE_VERSION } from '../types';
import type { DialogueCandidate, InsightCandidate } from '../types';
import type { InventorySnapshot, InventorySnapshotBatch, InventorySnapshotItem } from './inventorySnapshotProvider';

/**
 * Pure P0 (expired inventory) evaluation over an already-fetched, already
 * validated InventorySnapshot — no Supabase access here. See
 * inventorySnapshotProvider.ts for the shared fetch and
 * expiringSoonInventoryProvider.ts for the P1 evaluator that depends on
 * `expiredItemIds` returned below.
 */

/** A single item's qualifying expired source — either its earliest
 *  qualifying batch, or (only when it has no batch rows at all) the item's
 *  own legacy expiry field. */
interface ExpiredSource {
  kind: 'batch' | 'item';
  itemId: string;
  itemName: string | null;
  expiryDate: string;
  createdTime: string | null;
  batchId?: string;
  /** The already-checked (>0) qty this source qualified on — batch `qty` or
   *  item `quantity` — carried through purely for AI Experience Phase 1's
   *  `facts` exposure; never re-derived or re-checked, and never affects
   *  eligibility (that's decided above, in selectExpiredSourceForItem). */
  quantity: number;
}

/** Structured facts a future Landing Insight / Data-Driven Chat surface can
 *  read without re-querying Supabase or reverse-parsing `message`. Every
 *  field here is already computed by selectExpiredSourceForItem above —
 *  this is a pure exposure of existing values, not a new calculation. */
export interface ExpiredInventoryFacts {
  itemId: string;
  itemName: string | null;
  quantity: number;
  expiryDate: string;
  batchId?: string;
}

export interface ExpiredInventoryEvaluation {
  candidate: DialogueCandidate | null;
  /** Every independently eligible Expired candidate, in the same business
   *  order compareSourcesForSelection already produces — `candidates[0]` is
   *  always identical to `candidate` above. Additive: existing consumers
   *  that only read `candidate` are unaffected. See
   *  selectFirstEligibleDialogueCandidate in the dialogue layer for how this
   *  is used to skip session-seen/dismissed candidates without changing
   *  business selection order. */
  candidates: DialogueCandidate[];
  /** Every item id with at least one qualifying expired (P0) source — batch
   *  or legacy item-level, not just the globally-selected winner. The P1
   *  evaluator excludes all of these: an already-expired item must never
   *  also show as "expiring soon" (P0 represents the more serious state),
   *  even if a *different* batch on the same item would otherwise qualify
   *  for P1. */
  expiredItemIds: Set<string>;
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

/**
 * Batch-authoritative rule: if `itemBatches` is non-empty (the item has
 * batch records at all), only batch data may produce a candidate for this
 * item — the item's own `expiry_date`/`quantity` are never consulted, even
 * if no batch currently qualifies. Only an item with zero batch rows falls
 * back to the legacy item-level check.
 */
function selectExpiredSourceForItem(
  item: InventorySnapshotItem,
  itemBatches: InventorySnapshotBatch[] | undefined
): ExpiredSource | null {
  if (itemBatches && itemBatches.length > 0) {
    const qualifying = itemBatches.filter((b) => toNumber(b.qty) > 0 && isExpiredBeforeToday(b.expiry_date));
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
  if (toNumber(item.quantity) > 0 && isExpiredBeforeToday(item.expiry_date)) {
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

function compareSourcesForSelection(a: ExpiredSource, b: ExpiredSource): number {
  if (a.expiryDate !== b.expiryDate) return a.expiryDate < b.expiryDate ? -1 : 1;

  const aCreated = a.createdTime ?? '';
  const bCreated = b.createdTime ?? '';
  if (aCreated !== bCreated) return aCreated < bCreated ? -1 : 1;

  if (a.itemId !== b.itemId) return a.itemId < b.itemId ? -1 : 1;

  const aBatch = a.batchId ?? '';
  const bBatch = b.batchId ?? '';
  return aBatch < bBatch ? -1 : aBatch > bBatch ? 1 : 0;
}

function buildCandidateFromSource(source: ExpiredSource): InsightCandidate<ExpiredInventoryFacts> {
  const safeName = typeof source.itemName === 'string' && source.itemName.trim().length > 0 ? source.itemName.trim() : null;
  const message = safeName
    ? `${safeName} has expired. Please review it now.`
    : 'An inventory item has expired. Please review it now.';
  // messageTemplate is deliberately identical in shape to `message` — the
  // only variation in this candidate's wording is whether a name is known,
  // and `{itemName}` marks exactly that substitution point. `message` above
  // is untouched, byte-for-byte identical to before this refactor.
  const messageTemplate = '{itemName} has expired. Please review it now.';

  const dedupeKey =
    source.kind === 'batch'
      ? `inventory_expired:${source.itemId}:batch:${source.batchId}:${source.expiryDate}`
      : `inventory_expired:${source.itemId}:item:${source.expiryDate}`;

  const evaluatedAt = new Date().toISOString();
  const facts: ExpiredInventoryFacts = {
    itemId: source.itemId,
    itemName: source.itemName,
    quantity: source.quantity,
    expiryDate: source.expiryDate,
    ...(source.kind === 'batch' ? { batchId: source.batchId } : {}),
  };

  return {
    app: 'inventory',
    triggerId: DIALOGUE_ID.EXPIRED_INVENTORY,
    facts,
    messageTemplate,
    sourceRecordId: source.itemId,
    evaluatedAt,
    userState: 'ACTIVE_USER_URGENT',
    dialogueId: DIALOGUE_ID.EXPIRED_INVENTORY,
    priority: 'P0',
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
    bypassEntryWalk: true,
    eventTime: source.expiryDate,
    createdTime: source.createdTime ?? undefined,
    recordId: source.itemId,
  };
}

export function evaluateExpiredInventory(snapshot: InventorySnapshot): ExpiredInventoryEvaluation {
  const sources: ExpiredSource[] = [];

  for (const item of snapshot.items) {
    const source = selectExpiredSourceForItem(item, snapshot.batchesByItem.get(item.id));
    if (source) sources.push(source);
  }

  if (sources.length === 0) {
    return { candidate: null, candidates: [], expiredItemIds: new Set() };
  }

  const ordered = [...sources].sort(compareSourcesForSelection);
  const candidates = ordered.map(buildCandidateFromSource);
  return {
    candidate: candidates[0] ?? null,
    candidates,
    expiredItemIds: new Set(sources.map((s) => s.itemId)),
  };
}
