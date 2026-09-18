// Smallest bridge to get the already-resolved Phase-2B
// ProfitCalculatorInsightCandidate from App.tsx (where the app-wide
// publish call now lives — see App.tsx's own comment on this) across to
// CatMascot.jsx. Both are rendered from the same App.tsx return block, but
// not as direct parent/child of each other, so a Context Provider is the
// smallest correct relay — mirrors the E-Learning/Content Studio/To-Do
// pattern. No new Supabase query, no polling, no realtime.
//
// APP-WIDE PUBLISHER (this file's previous Dashboard-only design is gone):
// the Profit personalized reminder is a product requirement across every
// internal view (Clinic Settings, Dashboard, Plan History, Fixed Overhead,
// etc.), so the publish call in App.tsx runs unconditionally, regardless
// of `currentView` — never gated on any particular view being mounted.
// Dashboard.tsx keeps its OWN separate call to
// useProfitCalculatorPersonalizedInsight() purely to render its inline
// PersonalizedInsight banner (Dashboard-only presentation, unchanged) —
// it no longer publishes to this bridge at all.
//
// Because the publisher is now always co-mounted with CatMascot for the
// entire authenticated app lifetime, there is no longer a legitimate
// "publisher genuinely absent" state to represent — every previous
// Dashboard-only `expectPublisher`/`null` distinction existed ONLY because
// the publisher used to unmount whenever the user left Dashboard. The
// state model is now the two-way one described in the type below: an
// EAGER, non-null initial value of `{status:'not_ready'}` (rather than
// `null`) closes the one-render mount-order gap for good — the render
// before App.tsx's own publish effect first runs is now indistinguishable
// from ordinary "still loading", which CatMascot's arbitration already
// knows how to wait out (see arbitrateReturningUser's `not_ready` branch)
// — no timers, no guessed grace period.
//
// READINESS + OWNERSHIP SOURCE: CalculatorContext already owns
// `calculatorDataStatus` ('loading'|'ready'|'error') AND
// `calculatorDataUserId` (the user id the currently-accepted
// state/savedPlans actually belong to) — the exact same two signals
// already used by MolarAIFloat/resolveProfitDataQuery.ts for Phase-3 Data
// Chat's own readiness+ownership gate: ownership is checked FIRST
// (`calculatorDataUserId === current authenticated user id`), THEN
// readiness (`calculatorDataStatus === 'ready'`) — see
// resolveProfitDataQuery.ts's file header for why `status === 'ready'`
// alone is not a safe gate (a stale previous user's 'ready' status must
// never authorize a candidate for the current user). App.tsx reuses both
// signals for this bridge — not a new query, not a new readiness flag.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ProfitCalculatorInsightCandidate } from '../resolver/resolveProfitCalculatorInsight';

export type PersonalizedInsightBridgeState =
  | { status: 'not_ready' }
  | {
      status: 'ready';
      candidate: ProfitCalculatorInsightCandidate | null;
      /** App.tsx's own action handler (look up the plan by id in current
       *  savedPlans, openModal(plan.type, plan) — openModal/modalState are
       *  already owned app-wide by CalculatorContext and the modal itself
       *  already renders at App.tsx level regardless of `currentView`, so
       *  this works identically from any view). Captured together with
       *  `candidate` from the SAME publish call, so CatMascot adopting
       *  this pair and freezing it in refs until explicit dismissal
       *  guarantees the CTA always operates on the exact plan the user
       *  saw, never a later-drifted one — see App.tsx's own comment on
       *  this. */
      onAction: () => void;
    };

interface PersonalizedInsightBridgeContextValue {
  entry: PersonalizedInsightBridgeState;
  publish: (entry: PersonalizedInsightBridgeState) => void;
}

const PersonalizedInsightBridgeContext = createContext<PersonalizedInsightBridgeContextValue | null>(null);

export function PersonalizedInsightBridgeProvider({ children }: { children: ReactNode }) {
  // Non-null from the very first render — see the file header for why
  // `null` no longer belongs in this model now that the publisher is
  // app-wide and always co-mounted with CatMascot.
  const [entry, setEntry] = useState<PersonalizedInsightBridgeState>({ status: 'not_ready' });
  // Memoized so the Provider's context value keeps the same reference
  // across renders where `entry` hasn't actually changed (`setEntry` is
  // React's own stable setter identity, so `[entry]` is the complete and
  // correct dependency list) — otherwise every render would hand
  // consumers a fresh `{ entry, publish }` object regardless of whether
  // `entry` itself changed, defeating referential-equality bailouts for
  // any consumer (including `usePublishPersonalizedInsight`'s own effect,
  // which depends on this exact context value).
  const contextValue = useMemo(
    () => ({ entry, publish: setEntry }),
    [entry],
  );
  return (
    <PersonalizedInsightBridgeContext.Provider value={contextValue}>
      {children}
    </PersonalizedInsightBridgeContext.Provider>
  );
}

/** App.tsx calls this once, unconditionally (not gated on `currentView`),
 *  with its current readiness+ownership-gated state. Publishes on change.
 *  No unmount-revert-to-null: the app-wide publisher call site itself
 *  never unmounts during the authenticated app's lifetime, so there is no
 *  "publisher went away" transition left to represent. */
export function usePublishPersonalizedInsight(state: PersonalizedInsightBridgeState): void {
  const ctx = useContext(PersonalizedInsightBridgeContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.publish(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, state]);
}

/** CatMascot calls this — read-only, never publishes. Always a real
 *  `PersonalizedInsightBridgeState` (never `null`) — see the file header
 *  for why the app-wide publisher removes the need for a separate
 *  "absent" state. Before App.tsx's own publish effect has run for the
 *  first time, this returns the Provider's initial `{status:'not_ready'}`,
 *  which CatMascot's arbitration already treats as "wait, may be called
 *  again" — never as a decision to make. */
export function usePersonalizedInsightBridge(): PersonalizedInsightBridgeState {
  const ctx = useContext(PersonalizedInsightBridgeContext);
  return ctx?.entry ?? { status: 'not_ready' };
}
