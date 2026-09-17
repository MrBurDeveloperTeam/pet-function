/**
 * Framework/database-neutral persistence boundary for the Pet domain.
 *
 * The runtime (`src/pet/runtime/SharedPetRuntime.tsx`) depends ONLY on
 * this interface — never on `@supabase/supabase-js`, never on any host's
 * Supabase client instance. A concrete Supabase-backed implementation is
 * intentionally NOT provided in this package (see README "No default
 * PetRepository implementation") — each host writes its own thin adapter
 * over its OWN current database (e.g. Content Studio's
 * `contentStudioPetRepository.ts` maps `inventory_pet`/`pet_inventory`/
 * `aiboard_pricing_items`/`aiboard_pricing_currencies` — table names this
 * package must never know).
 *
 * PHASE 3D REVISION: `loadCatalog`/`loadCurrencies` in the Phase 2
 * skeleton were shaped before the real Content Studio source was read.
 * Content Studio's actual shop fetch returns ONE flat, mixed-category
 * list (food + beds + soap, all from `aiboard_pricing_items`) and looks
 * currency rate up ONE code at a time (`.ilike(...).maybeSingle()`), not a
 * bulk `{food,toys,beds}` split or a full currency list — this interface
 * now matches that real shape exactly. `ToyItem`/`BedItem` are NOT part of
 * the repository surface: toys are a fixed in-package catalog
 * (`TOY_ITEMS`) with no per-host pricing table today, and beds resolve
 * through the same flat `loadCatalog()` list via `category === 'Beds'`
 * (falling back to the package's own bundled `BED_ITEMS` when a host
 * hasn't configured a priced bed) — exactly as `GameStateContext`/
 * `PetRoom.getBedItem` do today.
 */
import type { FoodItem, PetInventoryItem, PetSaveSnapshot } from './pet';

export interface PetRepository {
  /** Returns `null` when no snapshot row exists yet for this user (first
   *  login) — the runtime seeds fresh starter stats in that case, exactly
   *  as Content Studio's `!petData && !petErr` branch does today. */
  loadSnapshot(userId: string): Promise<PetSaveSnapshot | null>;
  /** Upserts every field of `snapshot` EXCEPT `snapshot.stats.coins`,
   *  `snapshot.stats.xp`, and `snapshot.stats.level`, which a compliant
   *  implementation MUST ignore for an already-existing row (a fresh
   *  INSERT for a brand-new row may still seed all three from it — see
   *  `adoptPet`, the only caller that relies on this). Coins and xp/level
   *  are shared, cross-app-contested cumulative resources the same way
   *  `pet_inventory` rows are; this method is called on a 2s debounce by
   *  every stat change (including a routine hunger-decay tick, not just
   *  coin/XP changes), so writing them here unconditionally would let one
   *  tab's stale locally-cached values silently clobber a concurrently-
   *  updated real balance/progression from another app/tab. Coins are
   *  instead managed exclusively by `mutateCoins`/`purchasePetItem`'s
   *  atomic deltas (added in 0.8.0), and xp/level by `addXP`'s atomic
   *  delta+threshold transaction (added in 0.9.0) — each persisted
   *  immediately, never through this debounced path. */
  saveSnapshot(snapshot: PetSaveSnapshot): Promise<void>;
  /** Raw per-item rows — the runtime itself applies the exact same
   *  soap/soap2-exclusion and toy-quantity-clamped-to-1 mapping Content
   *  Studio's `GameStateContext` does today; the repository should not
   *  pre-apply that mapping. */
  loadInventoryRows(userId: string): Promise<PetInventoryItem[]>;
  /** Full-sync semantics: delete every existing row for `userId`, then
   *  bulk-insert exactly the given rows (an empty array means "delete
   *  all") — matches Content Studio's `pet_inventory` delete-then-insert
   *  sync exactly. Never a partial/diffed update.
   *
   *  Because the same `pet_inventory` rows are shared across up to 7
   *  host apps/tabs, sending this as the routine persistence path for
   *  every ordinary buy/consume action lets a stale in-memory snapshot
   *  from one tab silently prune an item another tab concurrently added
   *  — the runtime no longer does that (see `mutateInventoryItem`
   *  below). This method now exists for genuine full-replace operations
   *  only (e.g. resetting to `[]` on a fresh pet adoption) and as the
   *  runtime's own backward-compatible fallback when a host repository
   *  hasn't implemented `mutateInventoryItem` yet. */
  saveInventory(userId: string, items: PetInventoryItem[]): Promise<void>;
  /** Atomically adds `delta` (positive to gain, negative to spend/use) to
   *  the current DB quantity of ONE item, without reading or replacing
   *  any other item's row — the narrow, cross-app-safe persistence path
   *  the runtime now uses for `buyItem`/`consumeItem` instead of
   *  `saveInventory`'s full-list replace. Returns the resulting
   *  quantity (0 once the item is fully consumed/removed).
   *
   *  Implementations MUST: derive the owning user from the caller's own
   *  authenticated session, never trust `userId` as sufficient
   *  authorization by itself; clamp the resulting quantity at 0 (never
   *  allow negative inventory); leave every other item's row completely
   *  untouched; and make the read-modify-write atomic (e.g. a single
   *  `UPDATE ... SET quantity = quantity + delta` under the database's
   *  own row-level locking) so concurrent calls for the same item from
   *  different apps/tabs never lose an update.
   *
   *  OPTIONAL for backward compatibility: added in 0.7.0. A host
   *  repository that hasn't implemented this yet simply omits it — the
   *  runtime detects its absence and falls back to `saveInventory`. */
  mutateInventoryItem?(userId: string, itemId: string, delta: number): Promise<number>;
  /** Atomically adds `delta` (positive to earn, negative to spend) to the
   *  current DB `coins` balance for the CURRENT authenticated user,
   *  returning the resulting balance. Implementations MUST: derive the
   *  owning user from the caller's own session, never trust `userId` as
   *  sufficient authorization; reject (throw) a delta that would take
   *  the balance below 0 rather than silently clamping it, matching the
   *  runtime's own pre-spend affordability check; make the read-modify-
   *  write atomic so concurrent calls never lose an update, the same way
   *  `mutateInventoryItem` does for items.
   *
   *  OPTIONAL for backward compatibility: added in 0.8.0. A host
   *  repository that hasn't implemented this yet simply omits it — the
   *  runtime falls back to an immediate (non-debounced) `saveSnapshot`
   *  call instead. */
  mutateCoins?(userId: string, delta: number): Promise<number>;
  /** Atomically executes one shop purchase: validates the CURRENT
   *  authenticated user has at least `price` coins, deducts `price`, and
   *  increments `itemId`'s quantity by 1 — all as a single server-side
   *  transaction, so a purchase can never leave coins deducted without
   *  the item (or vice versa), and two concurrent purchases can never
   *  both succeed against the same now-insufficient balance. Throws
   *  (rather than partially applying) when the balance is insufficient.
   *
   *  OPTIONAL for backward compatibility: added in 0.8.0. A host
   *  repository that hasn't implemented this yet simply omits it — the
   *  runtime falls back to `mutateInventoryItem` + `mutateCoins` as two
   *  separate atomic single-resource calls (narrower than one
   *  transaction, but still strictly safer than the pre-0.7.0 full-list-
   *  replace path), and falls back again to `saveInventory` +
   *  `saveSnapshot` if neither of those exists either. */
  purchasePetItem?(userId: string, itemId: string, price: number): Promise<{ coins: number; quantity: number }>;
  /** Atomically applies `delta` XP to the CURRENT authenticated user's
   *  pet, determining resulting xp, resulting level, how many levels
   *  were gained, and the coupled level-up coin reward (if any) all from
   *  the CURRENT server-side row under a single lock/transaction — never
   *  from a client-supplied final xp/level, which could be computed from
   *  a stale local snapshot the way the runtime's own optimistic local
   *  update can be. Implementations MUST replicate the exact same
   *  threshold/reward rule the shared runtime's own client-side `addXP`
   *  uses: 100 XP per level, +50 coins per level gained, ONE threshold
   *  check per call (not a loop — a single large XP gain crosses at most
   *  one level here too, leaving any leftover XP above threshold to be
   *  resolved by a later call, exactly matching current product
   *  behavior) — so client and server can never disagree about
   *  progression.
   *
   *  OPTIONAL for backward compatibility: added in 0.9.0. A host
   *  repository that hasn't implemented this yet simply omits it — the
   *  runtime falls back to persisting its own optimistic local xp/level/
   *  coins via `mutateCoins`/`saveSnapshot` (best-effort only: every host
   *  that has already upgraded to this package's `save_pet_snapshot`-
   *  backed `saveSnapshot` treats xp/level as a no-op there regardless,
   *  same as coins). */
  addXP?(userId: string, delta: number): Promise<{ xp: number; level: number; levelsGained: number; coins: number }>;
  /** One flat, mixed-category shop catalog (food + beds + soap, ordered
   *  by unlock level ascending) — empty/rejected means "use the package's
   *  own static fallback catalog", matching Content Studio's own
   *  fallback-to-local-constants behavior on a failed/empty fetch. */
  loadCatalog(): Promise<FoodItem[]>;
  /** Single currency lookup by code (already normalized to a 3-letter
   *  uppercase code by the caller). `null` means "not configured for this
   *  host" — the runtime falls back to USD/rate 1, exactly as today. */
  loadCurrencyRate(currencyCode: string): Promise<{ code: string; rate: number } | null>;
}
