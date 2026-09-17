'use client';

import type { CSSProperties } from 'react';
import { getCatSpriteConfig, type CatPetId } from './petSprites';

// Sprite-grid constants shared by every pet's spritesheet (same 8-col x
// 9-row cell layout for all 6 — only which row/frame-count/duration a given
// animation state uses differs per pet, already captured in petSprites.ts).
// Copied verbatim from Content Studio's CatMascot.jsx — not recalculated.
export const CAT_FRAME_WIDTH = 192;
export const CAT_FRAME_HEIGHT = 208;
export const CAT_SCALE = 0.42;

const ROWS = {
  idle: { row: 0, frames: 6, duration: '1.1s' },
  runRight: { row: 1, frames: 8, duration: '0.7s' },
  runLeft: { row: 2, frames: 8, duration: '0.7s' },
  wave: { row: 3, frames: 4, duration: '0.8s' },
  review: { row: 3, frames: 4, duration: '0.8s' },
  sleep: { row: 5, frames: 1, duration: '1s', frame: 4 },
};

export interface CatSpriteProps {
  petId?: string | null;
  isWalking: boolean;
  facingLeft: boolean;
  isMeowing: boolean;
  isHovered: boolean;
  isSleeping: boolean;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  /** Host override for one or more pets' sprite sheet URL, keyed by pet
   *  id. Missing entries fall back to this package's own bundled default. */
  spriteSheetUrls?: Partial<Record<CatPetId, string>>;
}

/**
 * Internal — not exported publicly. Faithful port of Content Studio's
 * `MallowMascotSprite`; state-selection logic and CSS custom property names
 * are unchanged, only the static CSS (dimensions, background-size, timing
 * function) moved from a runtime injected `<style>` tag into the package's
 * compiled stylesheet (`.molar-cat-sprite` in styles/index.css).
 */
export function CatSprite({
  petId,
  isWalking,
  facingLeft,
  isMeowing,
  isHovered,
  isSleeping,
  onHoverStart,
  onHoverEnd,
  spriteSheetUrls,
}: CatSpriteProps) {
  const sprite = getCatSpriteConfig(petId, spriteSheetUrls);

  const shouldSleep = isSleeping && !isWalking && !isMeowing;
  const shouldReview = isHovered && !isWalking && !shouldSleep;
  const stateClass = shouldSleep
    ? 'molar-cat-sprite--sleep'
    : shouldReview
      ? 'molar-cat-sprite--review'
      : isWalking
        ? facingLeft
          ? 'molar-cat-sprite--run-left'
          : 'molar-cat-sprite--run-right'
        : 'molar-cat-sprite--idle';

  const reviewConfig = { row: sprite.hoverRow, frames: sprite.hoverFrames, duration: sprite.hoverDuration };
  const clickConfig = { row: sprite.clickRow, frames: sprite.clickFrames, duration: sprite.clickDuration };
  const idleConfig = { ...ROWS.idle, frames: sprite.idleFrames, duration: sprite.idleDuration };

  const config = shouldSleep
    ? { ...ROWS.sleep, frame: sprite.sleepHoldFrame }
    : shouldReview
      ? reviewConfig
      : isMeowing && !isWalking
        ? clickConfig
        : facingLeft && isWalking
          ? ROWS.runLeft
          : isWalking
            ? ROWS.runRight
            : idleConfig;

  const style = {
    '--sprite-row': config.row,
    '--sprite-frames': config.frames,
    '--sprite-duration': config.duration,
    '--sprite-frame': 'frame' in config ? config.frame : 0,
    '--pet-spritesheet': `url("${sprite.spriteSheetUrl}")`,
  } as CSSProperties;

  return (
    <div
      className={`molar-cat-sprite ${stateClass} ${isMeowing ? 'molar-cat-sprite--talking' : ''}`}
      aria-label={`pet ${stateClass.replace('molar-cat-sprite--', '')}`}
      onPointerEnter={onHoverStart}
      onMouseEnter={onHoverStart}
      onMouseOver={onHoverStart}
      onPointerLeave={onHoverEnd}
      onMouseLeave={onHoverEnd}
      style={style}
    />
  );
}
