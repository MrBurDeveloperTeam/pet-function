'use client';

import type { AIAdapter, PetRepository } from '../contracts';
import { SharedCatMascot } from '../cat';
import { SharedMolarAI } from '../ai';
import { SharedVirtualPet } from '../pet';

const NOOP_AI_ADAPTER: AIAdapter = {
  sendMessage: async () => ({ text: '' }),
};

export interface MolarExperienceLayerProps {
  /** Defaults to true. Set false to opt a domain out during incremental
   *  per-app migration (see README "Incremental adoption") — a host may
   *  still be running its own local implementation for a domain it hasn't
   *  migrated yet, alongside domains it has already moved onto this layer. */
  cat?: boolean;
  ai?: boolean;
  pet?: boolean;
  /** Required for real AI functionality when `ai` is true. Falls back to
   *  a no-op adapter (empty responses) if omitted, so this convenience
   *  layer still type-checks and renders for a host that hasn't wired AI
   *  yet — real hosts should always supply their own adapter. */
  aiAdapter?: AIAdapter;
  /** Whether the Virtual Pet overlay is open. Defaults to false — this
   *  layer does not own open/close state itself (matches Cat never
   *  importing Pet directly; the host's own composition decides when the
   *  pet opens, e.g. from a Cat click or a Molar AI `onPetToggle`). */
  petOpen?: boolean;
  /** Defaults to a no-op so this convenience layer still type-checks for a
   *  host that hasn't wired pet open/close state yet. */
  onPetClose?: () => void;
  /** Host-local database adapter. When `pet` is true but this is omitted,
   *  the pet is silently skipped (rather than throwing) — required for
   *  real Virtual Pet functionality, since this package intentionally
   *  ships no default `PetRepository` (see its own doc for why). */
  petRepository?: PetRepository;
  /** Opaque host-local user identifier, or `null`/omitted when not
   *  logged in. See `SharedVirtualPetProps.userId`'s doc. */
  petUserId?: string | null;
  /** See `SharedVirtualPetProps.currencyCode`. Defaults to `'USD'`. */
  petCurrencyCode?: string;
}

const NOOP_ON_PET_CLOSE = () => {};

/**
 * Convenience composition of all three domains for a host that migrates
 * everything at once. Domain-by-domain migration should prefer importing
 * `SharedCatMascot` / `SharedMolarAI` / `SharedVirtualPet` individually from
 * their own subpaths instead of this layer.
 */
export function MolarExperienceLayer({
  cat = true,
  ai = true,
  pet = true,
  aiAdapter,
  petOpen = false,
  onPetClose,
  petRepository,
  petUserId = null,
  petCurrencyCode,
}: MolarExperienceLayerProps) {
  return (
    <>
      {cat && <SharedCatMascot />}
      {ai && <SharedMolarAI adapter={aiAdapter ?? NOOP_AI_ADAPTER} />}
      {pet && petRepository && (
        <SharedVirtualPet
          isOpen={petOpen}
          onClose={onPetClose ?? NOOP_ON_PET_CLOSE}
          repository={petRepository}
          userId={petUserId}
          currencyCode={petCurrencyCode}
        />
      )}
    </>
  );
}
