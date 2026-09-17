/**
 * Ported from Content Studio's `src/VirtualPet/types.ts`. `PetStats`,
 * `FoodItem`, `ToyItem`, and `BedItem` are re-exported from the public
 * `contracts/pet` module instead of being duplicated here — see that
 * file's Phase 3D revision note for why the shapes were corrected against
 * real source. `RoomType`/`GameState`/`ChatMessage`/`Bubble`/`ToolType`
 * are internal-only concepts with no cross-app-normalized meaning, so
 * they stay defined here, unchanged.
 */
export type { PetStats, FoodItem, ToyItem, BedItem } from '../../contracts/pet';
import type { PetId } from './petOptions';

/**
 * Optional host override for this package's file-backed Virtual Pet
 * assets. Every field is optional and independently overridable; any
 * asset not covered by an override falls back to this package's own
 * bundled default — exact 0.5.0 behavior when `assetUrls` is omitted
 * entirely. Intended for hosts whose bundler cannot statically
 * discover/copy this package's internally-bundled asset references (e.g.
 * Next.js/Turbopack); Vite-based hosts do not need this.
 */
export interface PetAssetUrls {
  /** Pet spritesheet overrides, keyed by pet id — same identity space and
   *  same 6 assets as `SharedCatMascot`'s `spriteSheetUrls`. */
  spriteSheets?: Partial<Record<PetId, string>>;
  /** Bed shop-item image overrides. */
  beds?: {
    grey?: string;
    red?: string;
    purple?: string;
  };
  /** Bathroom-care tool/effect image overrides. */
  care?: {
    poop?: string;
    shower?: string;
    soap?: string;
  };
}

/**
 * A host-local game the shared Games selector renders as an additional
 * card after the 3 built-in games (Flappy Cat / Pac-Cat / Tetris) — e.g.
 * a host-specific game that predates this package or isn't part of its
 * shared catalog. The shared package never sees the game's own UI,
 * assets, or state; it only renders this descriptor's presentation and
 * calls `onSelect` on click. The host owns opening/closing/persisting
 * everything about the game itself, entirely outside this package.
 */
export interface ExtraGame {
  /** Stable identifier, host-local — this package never interprets it,
   *  only uses it as a React list key. */
  id: string;
  /** Card label, rendered the same way as the built-in games' titles. */
  title: string;
  /** Card thumbnail — same treatment as the built-in games' cover
   *  images (rounded, bordered, cover-fit background). */
  iconUrl: string;
  /** Called on click. The shared package does not open, render, or
   *  track any game state for this — the host is expected to already
   *  own its own open/close UI, triggered from here. */
  onSelect: () => void;
}

export enum RoomType {
  BEDROOM = 'BEDROOM',
  KITCHEN = 'KITCHEN',
  BATHROOM = 'BATHROOM',
  PLAYROOM = 'PLAYROOM',
  GARDEN = 'GARDEN',
  GAMES = 'GAMES',
}

export interface GameState {
  stats: import('../../contracts/pet').PetStats;
  name: string;
  isSleeping: boolean;
  lastInteraction: number;
  inventory: Record<string, number>;
}

export interface ChatMessage {
  sender: 'user' | 'pet';
  text: string;
  timestamp: number;
}

export interface Bubble {
  id: number;
  x: number;
  y: number;
  size: number;
}

export type ToolType = 'soap' | 'shower';
