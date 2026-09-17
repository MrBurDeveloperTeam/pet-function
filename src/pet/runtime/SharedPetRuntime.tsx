'use client';

/**
 * Generic Virtual Pet runtime — ported from Content Studio's
 * `src/VirtualPet/context/GameStateContext.tsx`.
 *
 * Every piece of business logic (offline decay formulas, the 5s game-loop
 * decay/energy-gain-while-sleeping tick, XP→level thresholds and level-up
 * rewards, buy/consume bounds checks, the 2s debounced persistence
 * sequence, localStorage key names/ordering, the sleep-state
 * "local vs remote, whichever updated_at is newer wins" tie-break, the
 * offline-decay-on-load formulas) is preserved EXACTLY — only the Supabase
 * calls themselves were replaced with calls through the host-supplied
 * `PetRepository`, and `currentUserId`/currency are now inputs (`userId`,
 * `currencyCode` props) instead of being resolved internally via
 * `supabase.auth.getSession()` / a hardcoded Content Studio pricing table.
 *
 * `soapInventory`/`setSoapInventory` from the original context type were
 * NOT carried forward — confirmed, by reading every component that
 * consumes `useGameState()`, that nothing in the actually-rendered tree
 * reads or writes it (dead state in the source being ported from).
 */
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { PetStats, RoomType, FoodItem, type PetAssetUrls } from '../internal/types';
import { BED_ITEMS, INITIAL_STATS, XP_TO_LEVEL_UP, INITIAL_INVENTORY, FOOD_ITEMS, TOY_ITEMS } from '../internal/constants';
import { DEFAULT_PET_ID, normalizePetId } from '../internal/petOptions';
import type { PetRepository } from '../../contracts/petRepository';
import type { PetSaveSnapshot } from '../../contracts/pet';

const TOY_ITEM_IDS = TOY_ITEMS.map((toy) => toy.id);
const ACTIVE_BED_KEY = 'pet_active_bed';
// NOT account-scoped, deliberately: a one-time "have we already applied the
// legacy default-bed migration on this browser" completion marker, not Pet
// data. Left global/inert like every other pre-0.6.6 unscoped key (see
// `getPetStorageKey`'s own doc comment) — it never holds anything
// account-sensitive, so scoping it would add nothing to the cross-account
// isolation guarantee this release exists to provide.
const ACTIVE_BED_DEFAULT_MIGRATION_KEY = 'pet_active_bed_default_none_v1';
const PET_SLEEPING_KEY = 'pet_is_sleeping';
const PET_SLEEPING_UPDATED_AT_KEY = 'pet_is_sleeping_updated_at';
const PET_ADOPTION_CONFIRMED_KEY = 'pet_adoption_confirmed';
export const DEFAULT_CURRENCY_CODE = 'USD';

export const normalizeCurrencyCode = (currency?: string | null) => {
    const normalized = (currency || '').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(normalized) ? normalized : DEFAULT_CURRENCY_CODE;
};

// Every account-sensitive Pet browser-cache key funnels through here.
// PERSIST-4: prior to this release, all Pet localStorage keys were bare,
// account-agnostic strings ('pet_stats', 'pet_name', ...) — a second
// account logging in on the same browser/origin could synchronously read
// the FIRST account's cached Pet state before that second account's own
// backend hydration resolved (see this release's own audit notes). Every
// key is now namespaced by the exact `userId` the owning
// `SharedPetProvider` instance was given, so account A's cache can never
// be read, written, or cleared as account B's, and vice versa.
//
// Returns `null` — deliberately, not a shared 'anonymous' bucket — when
// there is no authenticated `userId`. `SharedVirtualPetProps.userId` is a
// real, reachable `string | null` (guest/logged-out usage is an
// intentionally supported mode, not a theoretical edge case — see that
// prop's own doc comment), and a single shared fallback namespace would
// let two different logged-out sessions on the same browser/origin read
// and clobber each other's Pet state — the exact class of bug this
// release exists to close, just between guests instead of accounts. The
// required invariant is narrower and simpler: NO authenticated identity
// → NO account-sensitive Pet storage access at all. `read`/`write`/
// `removePetStorage` below are the only call sites that ever touch
// `localStorage` for these keys, and all three no-op when this returns
// `null`, so a logged-out session's Pet state is memory-only for that
// page load (matching the "no backend I/O either" half of the existing
// guest-mode contract) rather than silently sharing state with any other
// guest.
//
// Deliberately NOT a migration path either: this never reads the legacy
// pre-0.6.6 bare keys, and nothing here copies a legacy value into a new
// scoped key — see this release's own notes on why that would be unsafe
// (the legacy value carries no trustworthy identity to migrate FROM).
export const getPetStorageKey = (userId: string | null, key: string): string | null =>
    userId ? `snabbb_pet:${userId}:${key}` : null;

const readPetStorage = (userId: string | null, key: string): string | null => {
    const storageKey = getPetStorageKey(userId, key);
    return storageKey ? localStorage.getItem(storageKey) : null;
};
const writePetStorage = (userId: string | null, key: string, value: string): void => {
    const storageKey = getPetStorageKey(userId, key);
    if (storageKey) localStorage.setItem(storageKey, value);
};
const removePetStorage = (userId: string | null, key: string): void => {
    const storageKey = getPetStorageKey(userId, key);
    if (storageKey) localStorage.removeItem(storageKey);
};

const createStarterStats = (): PetStats => ({ ...INITIAL_STATS });
const createStarterInventory = (): Record<string, number> => ({});

const clearPetLocalStorage = (userId: string | null) => {
    [
        'pet_stats',
        'pet_name',
        'pet_inventory',
        'pet_last_saved_at',
        'pet_active_ball',
        ACTIVE_BED_KEY,
        PET_SLEEPING_KEY,
        PET_SLEEPING_UPDATED_AT_KEY,
        PET_ADOPTION_CONFIRMED_KEY,
    ].forEach((key) => removePetStorage(userId, key));
};

interface GameStateContextType {
    /** Internal-only (never part of `SharedVirtualPetProps`, this
     *  package's actual public surface) — exposed to internal consumers
     *  like `PetRoom` solely so THEIR OWN account-sensitive localStorage
     *  keys (e.g. the poop-spawn timer) can go through the same
     *  `getPetStorageKey` scoping this runtime uses for its own keys,
     *  without re-deriving or re-threading identity a second way. */
    userId: string | null;
    stats: PetStats;
    setStats: React.Dispatch<React.SetStateAction<PetStats>>;
    petName: string;
    setPetName: (name: string) => void;
    hasAdoptedPet: boolean;
    isPetAdoptionReady: boolean;
    adoptPet: (name: string) => Promise<boolean>;
    currentRoom: RoomType;
    setCurrentRoom: (room: RoomType) => void;
    isSleeping: boolean;
    setIsSleeping: (is: boolean) => void;
    isEating: boolean;
    setIsEating: (is: boolean) => void;
    isPlaying: boolean;
    setIsPlaying: (is: boolean) => void;
    inventory: Record<string, number>;
    buyItem: (itemId: string, price: number) => boolean;
    consumeItem: (itemId: string) => void;
    addXP: (amount: number) => void;
    /** Coin-only earn (positive) or spend (negative) not tied to a shop
     *  purchase — e.g. a mini-game's coin reward. Persists atomically and
     *  immediately (not via the debounced snapshot sync); prefer
     *  `buyItem` for anything that also grants/consumes an inventory
     *  item, since that commits coins + the item as one transaction. */
    addCoins: (delta: number) => void;
    activeBallId: string;
    setActiveBallId: (id: string) => void;
    activeBedId: string | null;
    setActiveBedId: (id: string | null) => void;
    foodItems: FoodItem[];
    isFoodLoading: boolean;
    currencyCode: string;
    currencyRate: number;
    assetUrls?: PetAssetUrls;
}

const GameStateContext = createContext<GameStateContextType | undefined>(undefined);

export interface SharedPetProviderProps {
    children: React.ReactNode;
    /** Opaque host-local authenticated owner ID (e.g. Content Studio's own
     *  Supabase auth uuid) — this phase intentionally keys persistence on
     *  the SAME per-host identity Content Studio already uses today, not
     *  a future cross-app `globalUserId`. `null` means "not logged in":
     *  no repository I/O is performed, and (PERSIST-4) no
     *  account-sensitive Pet localStorage is read or written either — a
     *  logged-out session runs in fully ephemeral, in-memory-only guest
     *  mode for that page load, never a persisted or shared cache (see
     *  `getPetStorageKey`'s own doc comment for why a shared guest
     *  namespace was deliberately removed). */
    userId: string | null;
    repository: PetRepository;
    /** Host-resolved currency code (e.g. from IP geolocation) — resolving
     *  this is host-specific (network + Supabase-coupled) and stays
     *  entirely in the host's own wrapper, exactly as
     *  `VirtualPetContainer`'s `detectAndLogVisit` does today. */
    currencyCode?: string;
    /** Optional host override for this package's file-backed static
     *  assets (pet spritesheets, beds, bathroom-care images). Omitted
     *  entirely reproduces exact 0.5.0 behavior. */
    assetUrls?: PetAssetUrls;
}

export const SharedPetProvider: React.FC<SharedPetProviderProps> = ({
    children,
    userId,
    repository,
    currencyCode: initialCurrencyCode = DEFAULT_CURRENCY_CODE,
    assetUrls,
}) => {
    const [stats, setStats] = useState<PetStats>(INITIAL_STATS);
    const [petName, _setPetName] = useState(DEFAULT_PET_ID);
    const [hasAdoptedPet, setHasAdoptedPet] = useState(false);
    const [isPetAdoptionReady, setIsPetAdoptionReady] = useState(false);
    const setPetName = (name: string) => {
        if (!hasAdoptedPet) _setPetName(normalizePetId(name));
    };
    const [currentRoom, setCurrentRoom] = useState<RoomType>(RoomType.KITCHEN);
    const [inventory, setInventory] = useState<Record<string, number>>(INITIAL_INVENTORY);
    const [isSleeping, setIsSleeping] = useState(() => {
        try {
            return readPetStorage(userId, PET_SLEEPING_KEY) === 'true';
        } catch {
            return false;
        }
    });
    const [isEating, setIsEating] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [activeBallId, setActiveBallId] = useState<string>('ball_red');
    const [activeBedId, setActiveBedId] = useState<string | null>(null);
    const [foodItems, setFoodItems] = useState<FoodItem[]>(FOOD_ITEMS);
    const [isFoodLoading, setIsFoodLoading] = useState(true);
    const [currencyCode, setCurrencyCode] = useState(() => normalizeCurrencyCode(initialCurrencyCode));
    const [currencyRate, setCurrencyRate] = useState(1);

    const isHydrated = useRef(false);
    const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Whether a debounced save is currently scheduled and has NOT yet
    // fired — set true the instant a save is (re)scheduled, and false the
    // instant the timer actually starts running it (before the async work
    // begins, closing the window where an unmount during that async work
    // could otherwise be mistaken for "still pending"). The unmount-only
    // flush effect below only acts while this is true, so a save that
    // already fired is never re-persisted merely because the component
    // later unmounts.
    const pendingSaveRef = useRef(false);
    // Always holds the exact payload a debounced save would persist for
    // the CURRENT render — reassigned unconditionally on every render
    // (not inside an effect), so it can never lag behind React state the
    // way a value captured once in an effect's dependency-triggered
    // closure could. This is what the unmount-only flush effect reads:
    // that effect's own cleanup has an empty dependency array (so it
    // never itself re-runs on state changes), and therefore cannot close
    // over "latest" state directly — reading it from this ref instead is
    // what lets the flush use the true final state right up to the
    // moment of unmount rather than whatever state existed when this
    // component first mounted.
    const latestPersistPayloadRef = useRef({
        stats, petName, hasAdoptedPet, inventory, isSleeping, activeBallId, activeBedId, userId, repository,
    });
    latestPersistPayloadRef.current = {
        stats, petName, hasAdoptedPet, inventory, isSleeping, activeBallId, activeBedId, userId, repository,
    };

    // The exact persistence body previously inlined in the debounce
    // timeout callback, extracted so both the normal debounced timer AND
    // the real-unmount flush (added below) can invoke the identical
    // sequence instead of duplicating it.
    const persistPetState = async (payload: typeof latestPersistPayloadRef.current) => {
        const { stats, petName, hasAdoptedPet, inventory, isSleeping, activeBallId, activeBedId, userId, repository } = payload;

        writePetStorage(userId, 'pet_stats', JSON.stringify(stats));
        if (hasAdoptedPet) {
            writePetStorage(userId, 'pet_name', petName);
            writePetStorage(userId, PET_ADOPTION_CONFIRMED_KEY, 'true');
        } else {
            removePetStorage(userId, 'pet_name');
            removePetStorage(userId, PET_ADOPTION_CONFIRMED_KEY);
        }
        writePetStorage(userId, 'pet_active_ball', activeBallId);
        if (activeBedId) {
            writePetStorage(userId, ACTIVE_BED_KEY, activeBedId);
        } else {
            removePetStorage(userId, ACTIVE_BED_KEY);
        }
        writePetStorage(userId, 'pet_inventory', JSON.stringify(inventory));
        writePetStorage(userId, PET_SLEEPING_KEY, String(isSleeping));
        writePetStorage(userId, 'pet_last_saved_at', new Date().toISOString());

        if (userId) {
            try {
                const snapshot: PetSaveSnapshot = {
                    globalUserId: userId,
                    stats,
                    identity: {
                        petName: hasAdoptedPet ? petName : '',
                        selectedPetId: petName,
                        isSleeping,
                        activeBallId,
                        activeBedId,
                    },
                    updatedAt: new Date().toISOString(),
                };
                // `snapshot.stats.coins`/`.xp`/`.level` are carried along
                // here because `PetSaveSnapshot`'s shape requires them,
                // but per `saveSnapshot`'s own contract doc a compliant
                // implementation must ignore all three for an already-
                // existing row -- coins are managed exclusively by
                // `mutateCoins`/`purchasePetItem`'s atomic deltas, and
                // xp/level by `addXP`'s atomic delta+threshold
                // transaction (each persisted immediately, never via this
                // debounced call). Writing them here unconditionally
                // would let this tab's own possibly-stale locally-cached
                // values (this effect also fires on every hunger-decay
                // tick, not just coin/XP changes) silently clobber a
                // concurrently-updated real balance or progression from
                // another app/tab.
                await repository.saveSnapshot(snapshot);
                // Inventory is deliberately NOT synced here. It used to be
                // sent as a full delete-all-then-insert (later upsert+
                // prune) snapshot on every debounce tick, which meant any
                // pending save from a stale tab/app could silently
                // overwrite an item another tab/app had concurrently
                // added or changed — the same shared `pet_inventory` rows
                // are written by up to 7 apps. Item-level mutations
                // (`buyItem`/`consumeItem`) now persist themselves
                // immediately via `persistInventoryDelta` below, which
                // touches only the single row it actually changed. The
                // only remaining full-replace path is `adoptPet`'s
                // deliberate reset-to-empty on a brand-new pet.
            } catch (e) {
                console.error('Failed to sync to repository', e);
            }
        }
    };

    // Persists ONE item's quantity change atomically, without touching any
    // other item's row — the fix for the stale-full-snapshot overwrite risk
    // described above. Prefers the narrow `mutateInventoryItem` repository
    // method (added alongside this fix); falls back to an immediate
    // (non-debounced) full-list `saveInventory` call for a host repository
    // that hasn't implemented it yet, so persistence never silently stops
    // working for an older adapter — it just loses this release's
    // narrower cross-app-safe guarantee until it upgrades.
    const persistInventoryDelta = async (itemId: string, delta: number, fullInventorySnapshot: Record<string, number>) => {
        if (!userId) return;
        try {
            if (repository.mutateInventoryItem) {
                await repository.mutateInventoryItem(userId, itemId, delta);
            } else {
                const invRows = Object.entries(fullInventorySnapshot)
                    .filter(([, qty]) => qty > 0)
                    .map(([id, qty]) => ({
                        itemId: id,
                        quantity: TOY_ITEM_IDS.includes(id) ? 1 : qty,
                    }));
                await repository.saveInventory(userId, invRows);
            }
        } catch (e) {
            console.error('Failed to persist inventory item mutation', e);
        }
    };

    // Persists a coin-only earn/spend atomically and immediately (not via
    // the debounced snapshot sync) -- coins are a shared, contested
    // resource across up to 7 apps/tabs the same way pet_inventory rows
    // are, so they get the same "narrow atomic RPC now, debounced
    // full-write never" treatment as items. Prefers `mutateCoins`; falls
    // back to an immediate full `saveSnapshot` for a host repository that
    // hasn't implemented it yet.
    const persistCoinsDelta = async (delta: number, fullStatsSnapshot: PetStats) => {
        if (!userId) return;
        try {
            if (repository.mutateCoins) {
                await repository.mutateCoins(userId, delta);
            } else {
                const payload = latestPersistPayloadRef.current;
                const snapshot: PetSaveSnapshot = {
                    globalUserId: userId,
                    stats: fullStatsSnapshot,
                    identity: {
                        petName: payload.hasAdoptedPet ? payload.petName : '',
                        selectedPetId: payload.petName,
                        isSleeping: payload.isSleeping,
                        activeBallId: payload.activeBallId,
                        activeBedId: payload.activeBedId,
                    },
                    updatedAt: new Date().toISOString(),
                };
                await repository.saveSnapshot(snapshot);
            }
        } catch (e) {
            console.error('Failed to persist coin mutation', e);
        }
    };

    // Persists ONE shop purchase -- coin deduction + item grant -- as a
    // single business action. Prefers the one-transaction
    // `purchasePetItem` (coins and the item commit or fail together, and
    // two concurrent purchases can never overspend the same balance);
    // falls back to two separate atomic single-resource calls
    // (`mutateInventoryItem` + `mutateCoins`) for a host repository that
    // has upgraded to 0.7.0's item-level mutation but not yet to 0.8.0's
    // purchase RPC; falls back again to the oldest full-list-replace path
    // for a host that hasn't upgraded at all.
    const persistPurchase = async (itemId: string, price: number, fullInventorySnapshot: Record<string, number>, fullStatsSnapshot: PetStats) => {
        if (!userId) return;
        try {
            if (repository.purchasePetItem) {
                await repository.purchasePetItem(userId, itemId, price);
            } else if (repository.mutateInventoryItem && repository.mutateCoins) {
                await repository.mutateInventoryItem(userId, itemId, 1);
                await repository.mutateCoins(userId, -price);
            } else {
                const invRows = Object.entries(fullInventorySnapshot)
                    .filter(([, qty]) => qty > 0)
                    .map(([id, qty]) => ({
                        itemId: id,
                        quantity: TOY_ITEM_IDS.includes(id) ? 1 : qty,
                    }));
                await repository.saveInventory(userId, invRows);
                await persistCoinsDelta(-price, fullStatsSnapshot);
            }
        } catch (e) {
            console.error('Failed to persist purchase', e);
        }
    };

    // Persists an XP gain (and its coupled level-up coin reward, if the
    // gain crosses the threshold) as one atomic server-side operation.
    // The local `setStats` update in `addXP` below is only an OPTIMISTIC
    // guess -- it decides whether to show a level-up locally using this
    // tab's own possibly-stale xp/level, the exact class of race this
    // phase closes. Once the server call resolves, local `stats` is
    // reconciled to its authoritative xp/level/coins, so a wrong local
    // guess (e.g. this tab thought it leveled up but another app/tab's
    // concurrent XP gain had already consumed the threshold, or vice
    // versa) never becomes the persisted -- or, for long, the displayed
    // -- truth.
    const persistXPDelta = async (delta: number, optimisticCoinsDelta: number, optimisticStats: PetStats) => {
        if (!userId) return;
        try {
            if (repository.addXP) {
                const result = await repository.addXP(userId, delta);
                setStats(prev => ({ ...prev, xp: result.xp, level: result.level, coins: result.coins }));
            } else {
                // Backward-compatible fallback for a host repository that
                // hasn't implemented addXP yet: persist the optimistic
                // xp/level/coins immediately via the pre-0.9.0 path. Best-
                // effort only for xp/level/coins specifically -- a host
                // already using this package's save_pet_snapshot-backed
                // saveSnapshot (every shipped host is) treats those three
                // fields as a no-op there regardless (see saveSnapshot's
                // own contract doc).
                if (optimisticCoinsDelta !== 0) {
                    await persistCoinsDelta(optimisticCoinsDelta, optimisticStats);
                }
                const payload = latestPersistPayloadRef.current;
                const snapshot: PetSaveSnapshot = {
                    globalUserId: userId,
                    stats: optimisticStats,
                    identity: {
                        petName: payload.hasAdoptedPet ? payload.petName : '',
                        selectedPetId: payload.petName,
                        isSleeping: payload.isSleeping,
                        activeBallId: payload.activeBallId,
                        activeBedId: payload.activeBedId,
                    },
                    updatedAt: new Date().toISOString(),
                };
                await repository.saveSnapshot(snapshot);
            }
        } catch (e) {
            console.error('Failed to persist XP mutation', e);
        }
    };

    // Fetch shop catalog from the host's repository
    useEffect(() => {
        const fetchFoodItems = async () => {
            setIsFoodLoading(true);
            try {
                const items = await repository.loadCatalog();
                if (items && items.length > 0) {
                    setFoodItems(items);
                }
            } catch (err) {
                console.error('Failed to load shop items:', err);
            } finally {
                setIsFoodLoading(false);
            }
        };

        fetchFoodItems();
    }, [repository]);

    // Fetch currency rate via the host's repository when currencyCode changes
    useEffect(() => {
        const fetchRate = async () => {
            const requestedCurrency = normalizeCurrencyCode(initialCurrencyCode);
            if (requestedCurrency === DEFAULT_CURRENCY_CODE) {
                setCurrencyCode(DEFAULT_CURRENCY_CODE);
                setCurrencyRate(1);
                return;
            }
            try {
                const result = await repository.loadCurrencyRate(requestedCurrency);
                if (result) {
                    setCurrencyCode(normalizeCurrencyCode(result.code));
                    setCurrencyRate(Number(result.rate) || 1);
                    console.log(`[Currency] ${result.code} rate: ${result.rate}`);
                } else {
                    // Fallback to USD if not found
                    setCurrencyCode(DEFAULT_CURRENCY_CODE);
                    setCurrencyRate(1);
                }
            } catch (err) {
                console.warn('[Currency] Failed to fetch rate:', err);
                setCurrencyCode(DEFAULT_CURRENCY_CODE);
                setCurrencyRate(1);
            }
        };
        fetchRate();
    }, [initialCurrencyCode, repository]);

    // Initial data load
    useEffect(() => {
        const init = async () => {
            // Load from localStorage as fallback — scoped to THIS provider
            // instance's own userId only (see `getPetStorageKey`'s doc
            // comment); never reads another account's or a pre-0.6.6
            // legacy unscoped key.
            const savedStats = readPetStorage(userId, 'pet_stats');
            const savedName = readPetStorage(userId, 'pet_name');
            const savedPetAdoptionConfirmed = readPetStorage(userId, PET_ADOPTION_CONFIRMED_KEY) === 'true';
            const savedInv = readPetStorage(userId, 'pet_inventory');
            const savedLastSavedAt = readPetStorage(userId, 'pet_last_saved_at');
            const savedSleeping = readPetStorage(userId, PET_SLEEPING_KEY);
            const savedSleepingUpdatedAt = readPetStorage(userId, PET_SLEEPING_UPDATED_AT_KEY);

            let loadedStats: PetStats | null = savedStats ? JSON.parse(savedStats) : null;

            // Apply offline decay based on elapsed time since last save
            if (loadedStats && savedLastSavedAt) {
                const elapsedMs = Date.now() - new Date(savedLastSavedAt).getTime();
                const elapsedSecs = Math.max(0, elapsedMs / 1000);
                // Decay rates per second (matching the live game loop: per 5s tick rates)
                loadedStats = {
                    ...loadedStats,
                    hunger:    Math.max(0, loadedStats.hunger    - 0.01  * elapsedSecs),
                    energy:    Math.max(0, loadedStats.energy    - 0.005 * elapsedSecs),
                    hygiene:   Math.max(0, loadedStats.hygiene   - 0.004 * elapsedSecs),
                    happiness: Math.max(0, loadedStats.happiness - 0.006 * elapsedSecs),
                };
                console.log(`[VirtualPet] Applied ${Math.round(elapsedSecs)}s of offline decay`);
            }

            if (loadedStats) setStats(loadedStats);
            if (savedSleeping !== null) setIsSleeping(savedSleeping === 'true');
            if (savedName && savedPetAdoptionConfirmed) {
                const adoptedPet = normalizePetId(savedName);
                _setPetName(adoptedPet);
                setHasAdoptedPet(true);
            }
            const savedBall = readPetStorage(userId, 'pet_active_ball');
            if (savedBall) setActiveBallId(savedBall);
            const savedBed = readPetStorage(userId, ACTIVE_BED_KEY);
            const hasMigratedDefaultBed = localStorage.getItem(ACTIVE_BED_DEFAULT_MIGRATION_KEY) === 'true';
            if (savedBed === 'bed_grey' && !hasMigratedDefaultBed) {
                removePetStorage(userId, ACTIVE_BED_KEY);
                localStorage.setItem(ACTIVE_BED_DEFAULT_MIGRATION_KEY, 'true');
            } else {
                if (savedBed) setActiveBedId(savedBed);
                if (!hasMigratedDefaultBed) {
                    localStorage.setItem(ACTIVE_BED_DEFAULT_MIGRATION_KEY, 'true');
                }
            }
            if (savedInv) setInventory(JSON.parse(savedInv));
            localStorage.removeItem('virtual_pet_bathroom_soap_inventory');

            // Load from the host repository if logged in (overriding localStorage)
            if (userId) {
                try {
                    let shouldLoadPetInventory = false;
                    const petData = await repository.loadSnapshot(userId);

                    if (!petData) {
                        const starterStats = createStarterStats();
                        const starterInventory = createStarterInventory();
                        clearPetLocalStorage(userId);
                        setStats(starterStats);
                        setInventory(starterInventory);
                        setActiveBallId('ball_red');
                        setActiveBedId(null);
                        setIsSleeping(false);
                        _setPetName(DEFAULT_PET_ID);
                        setHasAdoptedPet(false);
                        writePetStorage(userId, 'pet_stats', JSON.stringify(starterStats));
                        writePetStorage(userId, 'pet_inventory', JSON.stringify(starterInventory));
                        writePetStorage(userId, 'pet_last_saved_at', new Date().toISOString());
                    }

                    if (petData) {
                        // Apply offline decay using the repository's updated_at timestamp
                        const savedAt = petData.updatedAt ? new Date(petData.updatedAt).getTime() : null;
                        const elapsedSecs = savedAt ? Math.max(0, (Date.now() - savedAt) / 1000) : 0;

                        const baseStats = petData.stats;

                        const decayedStats: PetStats = elapsedSecs > 0 ? {
                            ...baseStats,
                            hunger:    Math.max(0, baseStats.hunger    - 0.01  * elapsedSecs),
                            energy:    Math.max(0, baseStats.energy    - 0.005 * elapsedSecs),
                            hygiene:   Math.max(0, baseStats.hygiene   - 0.004 * elapsedSecs),
                            happiness: Math.max(0, baseStats.happiness - 0.006 * elapsedSecs),
                        } : baseStats;

                        if (elapsedSecs > 0) {
                            console.log(`[VirtualPet] Applied ${Math.round(elapsedSecs)}s of offline decay (repository)`);
                        }

                        const localSleepUpdatedAt = savedSleepingUpdatedAt
                            ? new Date(savedSleepingUpdatedAt).getTime()
                            : 0;
                        const remoteUpdatedAt = petData.updatedAt
                            ? new Date(petData.updatedAt).getTime()
                            : 0;
                        const shouldUseLocalSleep =
                            savedSleeping !== null &&
                            localSleepUpdatedAt > 0 &&
                            localSleepUpdatedAt >= remoteUpdatedAt;

                        setStats(decayedStats);
                        if (petData.identity.petName) {
                            const adoptedPet = normalizePetId(petData.identity.petName);
                            _setPetName(adoptedPet);
                            setHasAdoptedPet(true);
                            writePetStorage(userId, 'pet_name', adoptedPet);
                            writePetStorage(userId, PET_ADOPTION_CONFIRMED_KEY, 'true');
                            shouldLoadPetInventory = true;
                            setIsSleeping(shouldUseLocalSleep ? savedSleeping === 'true' : !!petData.identity.isSleeping);
                            if (petData.identity.activeBallId) setActiveBallId(petData.identity.activeBallId);
                            setActiveBedId(petData.identity.activeBedId || null);
                        } else {
                            const starterStats = createStarterStats();
                            const starterInventory = createStarterInventory();
                            clearPetLocalStorage(userId);
                            setStats(starterStats);
                            setInventory(starterInventory);
                            setActiveBallId('ball_red');
                            setActiveBedId(null);
                            _setPetName(DEFAULT_PET_ID);
                            setHasAdoptedPet(false);
                            writePetStorage(userId, 'pet_stats', JSON.stringify(starterStats));
                            writePetStorage(userId, 'pet_inventory', JSON.stringify(starterInventory));
                            writePetStorage(userId, 'pet_last_saved_at', new Date().toISOString());
                        }
                    }

                    if (shouldLoadPetInventory) {
                        const invRows = await repository.loadInventoryRows(userId);
                        const newInv: Record<string, number> = {};
                        invRows.forEach((row) => {
                            if (row.itemId === 'soap' || row.itemId === 'soap2') return;
                            if (TOY_ITEM_IDS.includes(row.itemId)) {
                                newInv[row.itemId] = row.quantity > 0 ? 1 : 0;
                            } else {
                                newInv[row.itemId] = row.quantity;
                            }
                        });
                        setInventory(newInv);
                    }

                    // Only reached if the ENTIRE authenticated hydration
                    // sequence above resolved without throwing — i.e. only
                    // after loadSnapshot (and, when applicable,
                    // loadInventoryRows) genuinely confirmed either an
                    // existing snapshot or its legitimate absence. A
                    // rejected load must never be visually indistinguishable
                    // from a confirmed empty/new-user state: leaving these
                    // two flags at their initial `false` on that path keeps
                    // `PetAdoptionModal` (`!isPetAdoptionReady || ...`)
                    // suppressed instead of incorrectly showing the adopt
                    // flow, and keeps the debounced-save effect below
                    // (`if (!isHydrated.current) return;`) from persisting
                    // not-yet-confirmed — possibly still-starter-default —
                    // state back over the user's real backend data on the
                    // next game-loop tick. The next full remount (e.g.
                    // reopening Virtual Pet) retries hydration from scratch.
                    setIsPetAdoptionReady(true);
                    isHydrated.current = true;
                } catch (err) {
                    console.error('Failed to load from repository', err);
                }
            } else {
                // No authenticated user at all — this was always a fully
                // local, backend-independent session (see
                // `SharedPetProviderProps.userId`'s own doc comment), so
                // whatever the synchronous localStorage read above already
                // established is already the complete, confirmed truth.
                setIsPetAdoptionReady(true);
                isHydrated.current = true;
            }
        };

        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- ported unchanged: original ran once on mount
    }, []);

    // Sync to repository / LocalStorage — normal debounce lifecycle.
    //
    // This effect's cleanup runs on BOTH a dependency change (React tears
    // down the previous effect instance before running the next one) AND
    // on true unmount — there is no way to tell those two apart from
    // inside this effect. It must therefore stay a pure
    // cancel-and-reschedule: it only ever clears the pending timer, never
    // flushes. The actual real-unmount flush lives in a SEPARATE effect
    // below with an empty dependency array, whose cleanup React
    // guarantees only ever runs once, on genuine unmount — never on a
    // dependency-driven rerun of this effect.
    useEffect(() => {
        if (!isHydrated.current) return;

        if (saveTimeout.current) clearTimeout(saveTimeout.current);
        pendingSaveRef.current = true;

        saveTimeout.current = setTimeout(() => {
            // Claim the pending save before starting the async work so a
            // component unmount that happens to land while this callback
            // is mid-flight is never mistaken for "still pending" by the
            // unmount-flush effect below (which would otherwise risk a
            // duplicate save).
            saveTimeout.current = null;
            pendingSaveRef.current = false;
            void persistPetState(latestPersistPayloadRef.current);
        }, 2000); // 2 second debounce

        return () => {
            if (saveTimeout.current) clearTimeout(saveTimeout.current);
        };
    }, [stats, petName, hasAdoptedPet, inventory, isSleeping, activeBallId, activeBedId, userId, repository]);

    // Real-unmount-only flush. An effect with an empty dependency array
    // mounts/unmounts exactly once per component instance in production
    // (React's dev-only StrictMode double-invoke still can't create a
    // false positive here: that synthetic probe fires before hydration
    // or any state change has had a chance to schedule a save, so
    // `pendingSaveRef.current` is still `false` at that point — there is
    // nothing for this cleanup to flush during it). `key={userId}` at the
    // host call site fully remounts this whole provider (and therefore
    // every ref here, including this one) on a genuine account switch, so
    // a flush triggered by that remount always uses the outgoing
    // account's own refs/userId, never the incoming account's.
    useEffect(() => {
        return () => {
            if (saveTimeout.current && pendingSaveRef.current) {
                clearTimeout(saveTimeout.current);
                saveTimeout.current = null;
                pendingSaveRef.current = false;
                void persistPetState(latestPersistPayloadRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately empty: this must fire its cleanup ONLY on true unmount, never on a dependency-driven effect rerun (see comment above and PERSIST-3's phase notes).
    }, []);

    useEffect(() => {
        if (!isHydrated.current) return;

        writePetStorage(userId, PET_SLEEPING_KEY, String(isSleeping));
        writePetStorage(userId, PET_SLEEPING_UPDATED_AT_KEY, new Date().toISOString());
        window.dispatchEvent(new CustomEvent('virtual-pet-sleep-change', { detail: isSleeping }));
    }, [isSleeping]);

    useEffect(() => {
        if (!isHydrated.current) return;

        const activePetId = normalizePetId(petName);
        if (hasAdoptedPet) {
            writePetStorage(userId, 'pet_name', activePetId);
            writePetStorage(userId, PET_ADOPTION_CONFIRMED_KEY, 'true');
        }
        window.dispatchEvent(new CustomEvent('virtual-pet-selection-change', { detail: activePetId }));
    }, [petName, hasAdoptedPet]);

    // Game Loop (Stats decay)
    useEffect(() => {
        const timer = setInterval(() => {
            setStats(prev => {
                if (isSleeping) {
                    const activeBed = foodItems.find(item => item.id === activeBedId && item.category === 'Beds');
                    const fallbackBed = BED_ITEMS.find(bed => bed.id === activeBedId);
                    return {
                        ...prev,
                        energy: Math.min(100, prev.energy + (activeBed?.energyGain || fallbackBed?.energyGain || 1)),
                        hunger: Math.max(0, prev.hunger - 0.2),
                        hygiene: Math.max(0, prev.hygiene - 0.1)
                    };
                } else {
                    return {
                        ...prev,
                        hunger: Math.max(0, prev.hunger - 0.05),
                        energy: Math.max(0, prev.energy - 0.025),
                        hygiene: Math.max(0, prev.hygiene - 0.02),
                        happiness: Math.max(0, prev.happiness - 0.03)
                    };
                }
            });
        }, 5000); // Slower decay for background sync

        return () => clearInterval(timer);
    }, [isSleeping, activeBedId, foodItems]);

    const addXP = (amount: number) => {
        let coinsDelta = 0;
        let nextStats: PetStats = stats;
        setStats(prev => {
            let newXP = prev.xp + amount;
            let newLevel = prev.level;
            let newCoins = prev.coins;
            if (newXP >= XP_TO_LEVEL_UP) {
                newXP -= XP_TO_LEVEL_UP;
                newLevel += 1;
                newCoins = (prev.coins || 0) + 50;
                coinsDelta = 50;
                nextStats = {
                    ...prev,
                    level: newLevel,
                    xp: newXP,
                    happiness: 100,
                    energy: 100,
                    coins: newCoins
                };
                return nextStats;
            }
            nextStats = { ...prev, xp: newXP, level: newLevel };
            return nextStats;
        });
        // XP/level and the coupled level-up coin reward are committed
        // server-side as one atomic transaction (see persistXPDelta) --
        // never via a separate, standalone persistCoinsDelta call here,
        // which would let the server-side add_pet_xp RPC ALSO apply its
        // own +50-per-level reward independently, double-granting it.
        void persistXPDelta(amount, coinsDelta, nextStats);
    };

    // Coin-only earn/spend not tied to a shop purchase (e.g. a mini-game
    // reward) -- see `GameStateContextType.addCoins`'s own doc comment.
    const addCoins = (delta: number) => {
        let nextStats: PetStats = stats;
        setStats(prev => {
            nextStats = { ...prev, coins: Math.max(0, (prev.coins || 0) + delta) };
            return nextStats;
        });
        void persistCoinsDelta(delta, nextStats);
    };

    const adoptPet = async (name: string) => {
        if (hasAdoptedPet) return false;

        const adoptedPet = normalizePetId(name);
        const starterStats = createStarterStats();
        const starterInventory = createStarterInventory();
        const savedAt = new Date().toISOString();

        try {
            if (userId) {
                const snapshot: PetSaveSnapshot = {
                    globalUserId: userId,
                    stats: starterStats,
                    identity: {
                        petName: adoptedPet,
                        selectedPetId: adoptedPet,
                        isSleeping: false,
                        activeBallId: 'ball_red',
                        activeBedId: null,
                    },
                    updatedAt: savedAt,
                };
                await repository.saveSnapshot(snapshot);
                await repository.saveInventory(userId, []);
            }

            clearPetLocalStorage(userId);
            setStats(starterStats);
            setInventory(starterInventory);
            setActiveBallId('ball_red');
            setActiveBedId(null);
            setIsSleeping(false);
            _setPetName(adoptedPet);
            setHasAdoptedPet(true);
            writePetStorage(userId, 'pet_name', adoptedPet);
            writePetStorage(userId, PET_ADOPTION_CONFIRMED_KEY, 'true');
            writePetStorage(userId, 'pet_stats', JSON.stringify(starterStats));
            writePetStorage(userId, 'pet_inventory', JSON.stringify(starterInventory));
            writePetStorage(userId, 'pet_last_saved_at', savedAt);
            writePetStorage(userId, 'pet_active_ball', 'ball_red');
            writePetStorage(userId, PET_SLEEPING_KEY, 'false');
            writePetStorage(userId, PET_SLEEPING_UPDATED_AT_KEY, savedAt);
            window.dispatchEvent(new CustomEvent('virtual-pet-selection-change', { detail: adoptedPet }));
            return true;
        } catch (err) {
            console.error('Failed to adopt pet', err);
            return false;
        }
    };

    const buyItem = (itemId: string, price: number) => {
        if (stats.coins >= price) {
            let nextStats: PetStats = stats;
            setStats(prev => {
                nextStats = { ...prev, coins: prev.coins - price };
                return nextStats;
            });
            let nextInventory: Record<string, number> = {};
            setInventory(prev => {
                nextInventory = { ...prev, [itemId]: (prev[itemId] || 0) + 1 };
                return nextInventory;
            });
            // One business action (coins + item) persisted as one call --
            // see persistPurchase's own doc comment for why this replaced
            // the separate persistInventoryDelta-only call this used
            // pre-0.8.0.
            void persistPurchase(itemId, price, nextInventory, nextStats);
            return true;
        }
        return false;
    };

    const consumeItem = (itemId: string) => {
        let nextInventory: Record<string, number> = {};
        let hadItem = false;
        setInventory(prev => {
            const current = prev[itemId] || 0;
            hadItem = current > 0;
            if (current <= 1) {
                const newState = { ...prev };
                delete newState[itemId];
                nextInventory = newState;
            } else {
                nextInventory = { ...prev, [itemId]: current - 1 };
            }
            return nextInventory;
        });
        if (hadItem) {
            void persistInventoryDelta(itemId, -1, nextInventory);
        }
    };

    return (
        <GameStateContext.Provider value={{
            userId,
            stats, setStats,
            petName, setPetName,
            hasAdoptedPet,
            isPetAdoptionReady,
            adoptPet,
            currentRoom, setCurrentRoom,
            isSleeping, setIsSleeping,
            isEating, setIsEating,
            isPlaying, setIsPlaying,
            inventory,
            buyItem,
            consumeItem,
            addXP,
            addCoins,
            activeBallId,
            setActiveBallId,
            activeBedId,
            setActiveBedId,
            foodItems,
            isFoodLoading,
            currencyCode,
            currencyRate,
            assetUrls,
        }}>
            {children}
        </GameStateContext.Provider>
    );
};

export const useGameState = () => {
    const context = useContext(GameStateContext);
    if (context === undefined) {
        throw new Error('useGameState must be used within a SharedPetProvider');
    }
    return context;
};
