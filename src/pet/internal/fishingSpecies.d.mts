export type FishingBand = 'white' | 'green' | 'orange' | 'red';
export interface FishingSpecies { id: string; label: string; image: string; rarity: number }
export const FISHING_SPECIES: FishingSpecies[];
export const FISH_SPECIES: Record<string, FishingSpecies>;
export const FISH_BY_RARITY: FishingSpecies[][];
export const FISH_POOLS: Record<FishingBand, { rarity: number; weight: number }[]>;
export function chooseFishingSpecies(band: FishingBand, rarityBoost?: number, random?: () => number): FishingSpecies;
