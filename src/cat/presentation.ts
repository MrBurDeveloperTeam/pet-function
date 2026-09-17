/**
 * Public Cat presentation contract.
 *
 * These types describe ONLY resolved, already-decided visual state — no
 * Supabase, no candidate facts, no router, no localStorage/sessionStorage,
 * no PersonalizedInsightBridge internals. The host's own local controller
 * (dialogue arbitration, dismissal persistence, cross-tab sync, CTA
 * business behavior) computes these values and passes them down; this
 * package never re-derives or re-resolves any of it.
 */

/** One of the 6 selectable pets. Sprite assets/config are bundled inside
 *  this package (see cat/internal/petSprites.ts) — the host only ever
 *  passes the id string, never a URL. */
export type SharedCatPetId = 'mallow' | 'silverbelt' | 'fastrat' | 'gulu' | 'munchkin' | 'mochi';

export type CatDialoguePresentation =
  | { kind: 'none' }
  | {
      /** Intro and Welcome Back share this exact visual treatment today —
       *  a multi-step sequence with Back/Next/Close. */
      kind: 'sequence';
      steps: string[];
      stepIndex: number;
      onBack: () => void;
      onNext: () => void;
      onClose: () => void;
    }
  | {
      /** The Phase-2B proactive/personalized reminder bubble — single
       *  step, optional CTA, always has Close. */
      kind: 'personalized';
      message: string;
      action?: { label: string; onClick: () => void };
      onClose: () => void;
    };

export interface SharedCatMascotProps {
  /** Admin preview content, computed by the host's dialogue editor. */
  bubbleContent?: import('react').ReactNode;
  /** Pre-login/disabled mode: suppresses the ambient meow bubble and the
   *  onCatClick callback, exactly as Content Studio's current CatMascot. */
  disabled?: boolean;
  petId?: string | null;
  isSleeping?: boolean;
  /** Defaults to `{ kind: 'none' }` — a host that hasn't wired dialogue
   *  presentation yet still renders a valid, dialogue-less Cat. */
  dialogue?: CatDialoguePresentation;
  /** Ambient mood message bubble (e.g. "Normal"/"Hungry"/... state
   *  messages). Only ever shown when `dialogue.kind === 'none'` and
   *  `!disabled`. */
  meowMessage?: string | null;
  onCatClick?: () => void;
  /** Optional host override for one or more pets' sprite sheet image URL,
   *  keyed by pet id. Any id omitted (or the prop omitted entirely) falls
   *  back to this package's own bundled default asset — exact 0.5.0
   *  behavior. Intended for hosts whose bundler cannot statically
   *  discover/copy this package's internally-bundled asset references
   *  (e.g. Next.js/Turbopack); Vite-based hosts do not need this. */
  spriteSheetUrls?: Partial<Record<SharedCatPetId, string>>;
  /**
   * Fires exactly once per mount, the instant the Cat's initial entry walk
   * (screen-edge -> resting position) reaches its final position — not at
   * walk start, not on every idle/click-to-move walk afterward, and never
   * repeatedly. Optional: omitting it changes nothing about the Cat's own
   * rendering/animation, since this package owns entry-walk position
   * unconditionally regardless of whether a host listens.
   *
   * Exists so a host that gates its OWN dialogue-activation timing on the
   * Cat's arrival (so a dialogue bubble never visually opens mid-walk) has
   * a true completion signal to react to, instead of duplicating this
   * package's internal walk duration as a second, host-side timer.
   */
  onEntryWalkComplete?: () => void;
}
