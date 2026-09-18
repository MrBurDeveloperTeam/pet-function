'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, X } from 'lucide-react';
import { CatSprite } from './internal/CatSprite';
import { CAT_ENTRY_WALK_DURATION_MS } from './internal/timing';
import type { SharedCatMascotProps } from './presentation';

// Ported verbatim from Content Studio's CatMascot.jsx — click-to-move must
// ignore clicks on interactive/bubble elements exactly as today.
const MASCOT_CLICK_IGNORE_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'label',
  'summary',
  'img',
  'video',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="switch"]',
  '[aria-haspopup]',
  '[data-cat]',
  '[data-mascot-ignore]',
  '[data-ignore-mascot]',
  '[data-slot^="dropdown-menu"]',
].join(',');

/**
 * Public Cat visual/runtime entry point.
 *
 * Owns: sprite rendering, position/walk animation (entry walk +
 * double-click-to-move), the click-sound/wave feedback affordance, and the
 * three dialogue bubble presentations (sequence / personalized / ambient
 * meow). Does NOT own: dialogue arbitration, candidate resolution,
 * dismissal persistence, cross-tab sync, or CTA business behavior — those
 * stay entirely in the host's own local controller, which computes
 * `dialogue`/`meowMessage`/`petId`/`isSleeping` and passes them down as
 * already-resolved presentation props.
 *
 * Shared click audio is delivered from this package's
 * `/pet-function/audio/cat-meow.mp3` public resource.
 */
export function SharedCatMascot({
  disabled = false,
  petId,
  isSleeping = false,
  dialogue = { kind: 'none' },
  meowMessage = null,
  onCatClick,
  spriteSheetUrls,
  onEntryWalkComplete,
  bubbleContent,
}: SharedCatMascotProps) {
  const [catPos, setCatPos] = useState({ x: -10, y: 85 });
  const [isWalking, setIsWalking] = useState(false);
  const [facingLeft, setFacingLeft] = useState(false);
  const [isMeowing, setIsMeowing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [walkDuration, setWalkDuration] = useState(0.8);

  const walkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMoveStartPos = useRef({ x: -10, y: 85 });
  const lastMoveStartTime = useRef(0);
  const lastMoveDuration = useRef(0.8);
  const lastMoveTarget = useRef({ x: -10, y: 85 });

  useEffect(() => {
    // Entry walk into the screen from the left — identical timing/target
    // range to Content Studio's current effect.
    const destX = 20 + Math.random() * 60;
    const destY = 80 + Math.random() * 10;
    const duration = CAT_ENTRY_WALK_DURATION_MS / 1000;

    let cancelled = false;
    let rafId1: number | null = null;
    let rafId2: number | null = null;

    // Paint-boundary guard: `catPos`'s initial `useState({ x: -10, y: 85 })`
    // value IS the intended entry start position (already distinct from
    // `destX`/`destY` below — this was never a delta-zero bug). The actual
    // defect was that nothing forced the browser to ever paint that start
    // position before this same mount-time effect immediately overwrote it
    // with the destination: a bare no-deps effect's first setState can land
    // in the very same commit/paint the browser was about to produce for
    // the initial render, in which case the CSS `transition` on `left`/
    // `top` never has an actual "from" frame to animate away from — the Cat
    // silently snaps to its final position while `isWalking`'s sprite
    // animation (a separate, self-contained CSS keyframe loop unaffected by
    // this) keeps playing regardless, exactly matching the "plays walk
    // sprite but doesn't move" symptom. A double rAF is the standard,
    // deterministic way to guarantee the browser has committed and painted
    // a frame with the current (start) style before the destination style
    // is applied — not an arbitrary delay, and not tied to any particular
    // host's mount/visibility timing. Deferring only this destination-
    // setting/timer-arming step (not the dblclick listener/getInterpolatedPos
    // below, which must be live immediately) also means the completion
    // timer below still starts exactly when the real transition starts.
    rafId1 = requestAnimationFrame(() => {
      rafId2 = requestAnimationFrame(() => {
        if (cancelled) return;

        lastMoveStartPos.current = { x: -10, y: 85 };
        lastMoveTarget.current = { x: destX, y: destY };
        lastMoveStartTime.current = Date.now();
        lastMoveDuration.current = duration;

        setFacingLeft(false);
        setWalkDuration(duration);
        setCatPos({ x: destX, y: destY });
        setIsWalking(true);

        if (walkTimeoutRef.current) clearTimeout(walkTimeoutRef.current);
        walkTimeoutRef.current = setTimeout(() => {
          setIsWalking(false);
          // True entry-walk completion point: this timeout is the same
          // deterministic signal Shared itself already uses to flip
          // `isWalking` false, co-timed with the CSS `transition` duration
          // driving `catPos` above (now that the transition actually
          // starts here, right after the paint-boundary rAFs) — not a
          // second/approximate timer. Scoped to this initial-entry effect
          // only (deps `[]`, runs once per mount, its own cleanup below
          // cancels this exact timeout on unmount/StrictMode remount) so it
          // can never fire from a later click-to-move walk, which reuses
          // this same ref/setIsWalking(false) pattern below but is a
          // structurally separate setTimeout call site.
          onEntryWalkComplete?.();
        }, duration * 1000);
      });
    });

    const getInterpolatedPos = () => {
      const elapsed = (Date.now() - lastMoveStartTime.current) / 1000;
      const progress = Math.min(elapsed / lastMoveDuration.current, 1);
      return {
        x: lastMoveStartPos.current.x + (lastMoveTarget.current.x - lastMoveStartPos.current.x) * progress,
        y: lastMoveStartPos.current.y + (lastMoveTarget.current.y - lastMoveStartPos.current.y) * progress,
      };
    };

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest(MASCOT_CLICK_IGNORE_SELECTOR)) return;
      if (document.body.classList.contains('pet-assistant-hidden')) return;

      const targetX_px = e.clientX;
      const targetY_px = e.clientY;
      const targetX = (targetX_px / window.innerWidth) * 100;
      const targetY = (targetY_px / window.innerHeight) * 100;
      const currentPos = getInterpolatedPos();
      const currentX_px = (currentPos.x / 100) * window.innerWidth;
      const currentY_px = (currentPos.y / 100) * window.innerHeight;
      const distance_px = Math.sqrt((targetX_px - currentX_px) ** 2 + (targetY_px - currentY_px) ** 2);
      if (distance_px < 5) return;

      const duration = distance_px / 200;
      lastMoveStartPos.current = currentPos;
      lastMoveTarget.current = { x: targetX, y: targetY };
      lastMoveStartTime.current = Date.now();
      lastMoveDuration.current = duration;

      const nextFacingLeft = targetX < currentPos.x;
      setFacingLeft(nextFacingLeft);
      setWalkDuration(duration);
      setCatPos({ x: targetX, y: targetY });
      setIsWalking(true);

      if (walkTimeoutRef.current) clearTimeout(walkTimeoutRef.current);
      walkTimeoutRef.current = setTimeout(() => {
        setIsWalking(false);
      }, duration * 1000);
    };

    document.addEventListener('dblclick', handleGlobalClick);
    return () => {
      cancelled = true;
      if (rafId1 !== null) cancelAnimationFrame(rafId1);
      if (rafId2 !== null) cancelAnimationFrame(rafId2);
      document.removeEventListener('dblclick', handleGlobalClick);
      if (walkTimeoutRef.current) clearTimeout(walkTimeoutRef.current);
    };
  }, []);

  const handleCatClick = () => {
    if (!isSleeping) {
      setIsMeowing(true);
      setTimeout(() => setIsMeowing(false), 800);
    }
    if (!disabled) onCatClick?.();
  };

  return (
    <div className="snabbb-molar-experience" data-molar-theme="light">
    <div
      className="molar-cat-wrapper"
      style={{
        left: `${catPos.x}%`,
        top: `${catPos.y}%`,
        transform: 'translate(-50%, -100%)',
        transition: `left ${walkDuration}s linear, top ${walkDuration}s linear`,
      }}
    >
      <AnimatePresence mode="wait">{bubbleContent}</AnimatePresence>
      <AnimatePresence mode="wait">
        {dialogue.kind === 'sequence' && (
          <motion.div
            data-cat="true"
            key={`molar-dialog-bubble-${dialogue.stepIndex}`}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="molar-cat-bubble"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="molar-cat-bubble__body">
              <div className="molar-cat-bubble__text-row">
                <p className="molar-cat-bubble__text">{dialogue.steps[dialogue.stepIndex]}</p>
              </div>
              <div className="molar-cat-bubble__footer molar-cat-bubble__footer--sequence">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    dialogue.onBack();
                  }}
                  disabled={dialogue.stepIndex === 0}
                  className="molar-cat-bubble__btn molar-cat-bubble__btn--back"
                >
                  <ChevronLeft className="molar-cat-bubble__icon" /> Back
                </button>
                {dialogue.stepIndex === dialogue.steps.length - 1 ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dialogue.onClose();
                    }}
                    className="molar-cat-bubble__btn molar-cat-bubble__btn--link"
                  >
                    Close <X className="molar-cat-bubble__icon" />
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dialogue.onNext();
                    }}
                    className="molar-cat-bubble__btn molar-cat-bubble__btn--link"
                  >
                    Next <ChevronRight className="molar-cat-bubble__icon" />
                  </button>
                )}
              </div>
            </div>
            <div className="molar-cat-bubble__tail" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {dialogue.kind === 'personalized' && (
          <motion.div
            data-cat="true"
            key="molar-dialog-bubble-personalized"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="molar-cat-bubble"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="molar-cat-bubble__body">
              <div className="molar-cat-bubble__text-row">
                <p className="molar-cat-bubble__text">{dialogue.message}</p>
              </div>
              <div className="molar-cat-bubble__footer molar-cat-bubble__footer--personalized">
                {dialogue.action && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dialogue.action!.onClick();
                    }}
                    className="molar-cat-bubble__btn molar-cat-bubble__btn--cta"
                  >
                    {dialogue.action.label}
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    dialogue.onClose();
                  }}
                  className="molar-cat-bubble__btn molar-cat-bubble__btn--link"
                >
                  Close <X className="molar-cat-bubble__icon" />
                </button>
              </div>
            </div>
            <div className="molar-cat-bubble__tail" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {!disabled && dialogue.kind === 'none' && meowMessage && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="molar-cat-meow-bubble"
          >
            <span className="molar-cat-meow-bubble__text">{meowMessage}</span>
            <div className="molar-cat-bubble__tail" />
          </motion.div>
        )}
      </AnimatePresence>

      <div
        data-cat="true"
        onClick={(e) => {
          e.stopPropagation();
          handleCatClick();
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseOver={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ pointerEvents: 'auto' }}
      >
        <CatSprite
          petId={petId}
          isWalking={isWalking}
          facingLeft={facingLeft}
          isMeowing={isMeowing}
          isHovered={isHovered}
          isSleeping={isSleeping}
          onHoverStart={() => setIsHovered(true)}
          onHoverEnd={() => setIsHovered(false)}
          spriteSheetUrls={spriteSheetUrls}
        />
      </div>
    </div>
    </div>
  );
}
