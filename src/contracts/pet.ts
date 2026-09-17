/**
 * Canonical Virtual Pet domain types.
 *
 * PHASE 3D REVISION: the Phase 2 skeleton's `FoodItem`/`ToyItem`/`BedItem`
 * shapes (`itemId`/`name`/`priceUsd`/`unlockLevel`) were an educated guess
 * made before the real Content Studio source was inspected. Having now
 * read `src/VirtualPet/types.ts`, `constants.ts`, and
 * `context/GameStateContext.tsx` directly, those types are corrected here
 * to the field names/shapes actually used throughout the ported
 * presentation and runtime (`id`/`label`/`price`/`levelReq`, etc.) — this
 * is a correction against real source, not an invented redesign.
 *
 * `PetStats` itself was already confirmed byte-identical across all 7
 * apps' `GameStateContext` implementations in an earlier phase and is
 * unchanged here.
 */

export interface PetStats {
  hunger: number;
  energy: number;
  happiness: number;
  hygiene: number;
  level: number;
  xp: number;
  coins: number;
}

export interface PetIdentity {
  /** Empty string means "no pet adopted yet" — mirrors the original's
   *  `null`/falsy `pet_name` column check exactly (see
   *  `PetRepository.loadSnapshot`'s doc for the adapter-side mapping). */
  petName: string;
  selectedPetId: string;
  isSleeping: boolean;
  activeBallId: string | null;
  activeBedId: string | null;
}

export interface PetInventoryItem {
  itemId: string;
  quantity: number;
}

export interface PetCatalogItem {
  id: string;
  icon: string;
  label: string;
  price: number;
  category: string;
  levelReq?: number;
}

export interface FoodItem extends PetCatalogItem {
  hunger: number;
  xp: number;
  energy?: number;
  happiness?: number;
  hygiene?: number;
  energyGain?: number;
  imageSrc?: string;
}

/**
 * NOT a `PetCatalogItem` — Content Studio's real `ToyItem` (`types.ts`)
 * has no `category` field; toys are a fixed in-package catalog
 * (`TOY_ITEMS`), not host-priced rows, so this intentionally does not
 * extend the shop-catalog base shape.
 */
export interface ToyItem {
  id: string;
  icon: string;
  label: string;
  price: number;
  color: string;
  levelReq?: number;
}

export interface BedItem {
  id: string;
  label: string;
  price: number;
  /** Bundler-resolved asset URL for the package's own bundled beds, or a
   *  host-resolved URL for a host-supplied bed image (e.g. Content
   *  Studio's `aiboard_pricing_items.image_src`). */
  src: string;
  energyGain: number;
  levelReq?: number;
}

export interface PetSaveSnapshot {
  /** Opaque host-local user identifier — for THIS phase this is exactly
   *  the identifier the host's own auth/session already uses today (e.g.
   *  Content Studio's Supabase auth uuid), NOT a resolved cross-app
   *  identity. The shared runtime treats this purely as an opaque key: it
   *  is threaded straight through to `PetRepository` calls and never
   *  parsed, validated, or reinterpreted. See `MolarIdentity.localAppUserId`
   *  in `identity.ts` for where a host sources this value from today, and
   *  its doc comment for why `globalUserId` is intentionally NOT used yet. */
  globalUserId: string;
  stats: PetStats;
  identity: PetIdentity;
  /** ISO timestamp. Explicit, first-class field — the future global-pet
   *  merge policy ("latest valid updated_at wins as one coherent row")
   *  keys directly on this value. Not implemented in this phase. */
  updatedAt: string;
}
