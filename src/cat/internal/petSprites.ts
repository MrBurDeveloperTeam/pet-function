/**
 * INTERNAL sprite configuration for the 6 selectable Cat pets.
 *
 * This is a DELIBERATE, SCOPED duplication of exactly the sprite-relevant
 * fields from Content Studio's `src/VirtualPet/petOptions.ts` — not a move,
 * not a bulk copy. Values (idleFrames/idleDuration/hoverRow/hoverFrames/
 * hoverDuration/clickRow/clickFrames/clickDuration/sleepHoldFrame) are
 * copied verbatim from that file, verified against source, not invented.
 * Fields VirtualPet's full game logic needs but Cat's own render never
 * reads (mouthPosition, sleepInFrames, label, catalog/economy fields) are
 * intentionally NOT duplicated here — see README "Cat asset extraction
 * boundary". `src/VirtualPet/petOptions.ts` itself is untouched and
 * remains the single source of truth for the full Virtual Pet game.
 *
 * `spriteSheetUrl` here is a bundler-resolved import of this package's own
 * copied spritesheet asset — never a host-relative absolute path.
 */
import mallowUrl from '../../assets/cat/mallow-spritesheet.webp';
import silverbeltUrl from '../../assets/cat/silverbelt-spritesheet.webp';
import fastratUrl from '../../assets/cat/fastrat-spritesheet.webp';
import guluUrl from '../../assets/cat/gulu-spritesheet.webp';
import munchkinUrl from '../../assets/cat/munchkinspritesheet.webp';
import mochiUrl from '../../assets/cat/mochi-spritesheet.webp';

export type CatPetId = 'mallow' | 'silverbelt' | 'fastrat' | 'gulu' | 'munchkin' | 'mochi';

export interface CatSpriteConfig {
  spriteSheetUrl: string;
  sleepHoldFrame: number;
  idleFrames: number;
  idleDuration: string;
  hoverRow: number;
  hoverFrames: number;
  hoverDuration: string;
  clickRow: number;
  clickFrames: number;
  clickDuration: string;
}

const CAT_SPRITE_CONFIG: Record<CatPetId, CatSpriteConfig> = {
  mallow: {
    spriteSheetUrl: mallowUrl,
    sleepHoldFrame: 4,
    idleFrames: 6,
    idleDuration: '1.1s',
    hoverRow: 3,
    hoverFrames: 4,
    hoverDuration: '0.8s',
    clickRow: 3,
    clickFrames: 4,
    clickDuration: '0.72s',
  },
  silverbelt: {
    spriteSheetUrl: silverbeltUrl,
    sleepHoldFrame: 4,
    idleFrames: 6,
    idleDuration: '1.1s',
    hoverRow: 3,
    hoverFrames: 4,
    hoverDuration: '0.8s',
    clickRow: 3,
    clickFrames: 4,
    clickDuration: '0.72s',
  },
  fastrat: {
    spriteSheetUrl: fastratUrl,
    sleepHoldFrame: 3,
    idleFrames: 2,
    idleDuration: '1.1s',
    hoverRow: 3,
    hoverFrames: 4,
    hoverDuration: '0.8s',
    clickRow: 3,
    clickFrames: 4,
    clickDuration: '0.72s',
  },
  gulu: {
    spriteSheetUrl: guluUrl,
    sleepHoldFrame: 4,
    idleFrames: 4,
    idleDuration: '1.1s',
    hoverRow: 8,
    hoverFrames: 6,
    hoverDuration: '1.0s',
    clickRow: 8,
    clickFrames: 6,
    clickDuration: '1.0s',
  },
  munchkin: {
    spriteSheetUrl: munchkinUrl,
    sleepHoldFrame: 7,
    idleFrames: 6,
    idleDuration: '1.1s',
    hoverRow: 3,
    hoverFrames: 4,
    hoverDuration: '0.8s',
    clickRow: 3,
    clickFrames: 4,
    clickDuration: '0.72s',
  },
  mochi: {
    spriteSheetUrl: mochiUrl,
    sleepHoldFrame: 4,
    idleFrames: 6,
    idleDuration: '1.1s',
    hoverRow: 3,
    hoverFrames: 4,
    hoverDuration: '0.8s',
    clickRow: 3,
    clickFrames: 4,
    clickDuration: '0.72s',
  },
};

export const DEFAULT_CAT_PET_ID: CatPetId = 'mallow';

export function normalizeCatPetId(value?: string | null): CatPetId {
  return value && Object.prototype.hasOwnProperty.call(CAT_SPRITE_CONFIG, value)
    ? (value as CatPetId)
    : DEFAULT_CAT_PET_ID;
}

export function getCatSpriteConfig(
  petId?: string | null,
  spriteSheetUrlOverrides?: Partial<Record<CatPetId, string>>
): CatSpriteConfig {
  const normalizedId = normalizeCatPetId(petId);
  const config = CAT_SPRITE_CONFIG[normalizedId];
  const override = spriteSheetUrlOverrides?.[normalizedId];
  return override ? { ...config, spriteSheetUrl: override } : config;
}
