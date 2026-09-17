/**
 * Dialogue contracts.
 *
 * Hard rules enforced by this shape (see README):
 *  - The shared runtime NEVER sorts `candidates` — the host supplies them
 *    already in business priority order.
 *  - The shared runtime NEVER interprets `facts` — it is opaque, generically
 *    typed payload for the host's own `onAction`/CTA rendering only.
 *  - `onAction` always receives the EXACT candidate object the runtime
 *    adopted/showed — never a freshly re-resolved "current winner". This is
 *    what preserves exact-adopted-candidate binding across a Close/CTA race.
 *  - There is no live re-resolution at CTA click time.
 */

export interface DialogueAction {
  label: string;
  /** Opaque to the shared package — the host interprets this string itself
   *  (e.g. to pick a route, a tab, a callback) inside its own `onAction`. */
  actionId?: string;
}

export interface DialogueCandidate<
  TFacts extends Record<string, unknown> = Record<string, unknown>
> {
  /** e.g. 'expired_inventory', 'followed_creator_posted'. Host-defined. */
  triggerId: string;
  message: string;
  /** Stable across reloads. The shared runtime derives all storage/dedupe
   *  behavior from this value — it never invents or reshapes it. */
  dedupeKey: string;
  facts: TFacts;
  action?: DialogueAction;
}

export type PersonalizedDialogueState<
  TCandidate extends DialogueCandidate = DialogueCandidate
> =
  | { status: 'not_ready' }
  | { status: 'ready'; candidates: readonly TCandidate[] };

/**
 * Reactive contract (per Phase 2 correction): `state` is a plain value the
 * host re-renders with when it changes — the shared runtime never polls
 * `getPersonalizedState()`. The host owns re-render timing entirely.
 */
export interface DialogueAdapter<
  TCandidate extends DialogueCandidate = DialogueCandidate
> {
  state: PersonalizedDialogueState<TCandidate>;
  onAction(candidate: TCandidate): void | Promise<void>;
}

/**
 * Config for the shared Intro/Welcome-Back slot machinery used by the six
 * standard mini-apps. An app that folds its own "intro" concept into its
 * own ordered `candidates[]` instead (e.g. App Gallery) should pass
 * `enableIntroSlot: false` and simply never use this slot.
 *
 * Deliberately NOT configurable here: F5 behavior, dismissal persistence,
 * cross-tab sync, one-dialogue-per-activation, no-cascade. Those are fixed
 * runtime rules, not host options — see README "Shared dialogue-runtime
 * responsibilities".
 */
export interface IntroConfig {
  enableIntroSlot?: boolean;
}

export interface WelcomeBackConfig {
  autoCloseMs?: number;
}

export interface DialogueRuntimeConfig {
  intro?: IntroConfig;
  welcomeBack?: WelcomeBackConfig;
}
