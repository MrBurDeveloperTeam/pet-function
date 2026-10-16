export type WardrobeSlot = 'neck' | 'body';
export interface WardrobeItem { id: string; label: string; slot: WardrobeSlot; price: number; color: string; accent: string }
export type CatOutfit = Partial<Record<WardrobeSlot, string>>;
export interface WardrobeState { owned: string[]; outfits: Record<string, CatOutfit> }
export const WARDROBE_PET_IDS: string[];
export const WARDROBE_ITEMS: WardrobeItem[];
export const WARDROBE_BY_ID: Record<string, WardrobeItem>;
export function emptyWardrobe(): WardrobeState;
export function validateWardrobe(value: unknown): WardrobeState;
export function equipWardrobe(state: WardrobeState, petId: string, slot: WardrobeSlot, itemId: string | null): WardrobeState;
export function tryOnWardrobeItem(preview: CatOutfit, itemId: string): CatOutfit;
export function clearWardrobePreviewSlot(preview: CatOutfit, slot: WardrobeSlot, submittedItemId: string | undefined): CatOutfit;
export function wardrobeJewelrySpriteUrl(petId: string, itemId: string, body?: string | null): string;
export function wardrobeJewelryIconUrl(itemId: string): string;
export function wardrobeCatSpriteUrl(petId: string, itemId: string): string | null;
export function petAppearanceLayers(petId: string, outfit: CatOutfit | undefined, originalSpriteUrl: string): string[];
