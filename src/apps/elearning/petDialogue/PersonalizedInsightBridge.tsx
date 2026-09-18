// Smallest bridge to get the already-resolved Phase-2B InsightCandidate
// from Home.tsx (where useElearningPersonalizedInsight's queries actually
// live/are cached) across to CatMascot.jsx (mounted as a sibling of the
// router in App.tsx, not a descendant of Home). No new Supabase query, no
// polling, no realtime — this is a pure read-only React Context relay of a
// value Home already computed.
//
// THREE-WAY STATE (fixes the original readiness race): the context value
// is `PersonalizedInsightBridgeState | null`, where `null` specifically
// means "no publisher currently mounted" (off-Home route, or Home
// unmounted) — distinct from `{status:'not_ready'}`, which means "Home IS
// mounted and is actively telling us its Phase-2 source is still
// resolving." Collapsing these two into one falsy value was exactly what
// let Welcome Back activate prematurely while Home's own queries were
// still loading: CatMascot had no way to tell "nothing published yet
// because nothing is mounted" apart from "nothing published yet because
// Home is mounted but still loading." See CatMascot.jsx's
// arbitrateReturningUser for how each of the three states is handled.
//
// Deliberately route-scoped, not global: a non-`null` state only ever
// exists while Home is mounted and publishing (see
// usePublishPersonalizedInsight below, called only from Home.tsx). On any
// other route, `entry` reverts to `null` — this is intentional (see the
// task's own instruction not to add a global fetch just to make the
// reminder available everywhere).

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ElearningInsightCandidate } from '../resolver/resolveElearningInsight';

/** Mirrors useElearningPersonalizedInsight's own readiness signals
 *  (userId present, notifications/following query settled) — see that
 *  hook's file header for the full readiness contract this reuses. */
export type PersonalizedInsightBridgeState =
  | { status: 'not_ready' }
  | {
      status: 'ready';
      /** Ordered dialogue pool across Followed Creator Posted > Latest
       *  Video Performance > Most Viewed Video — see
       *  buildElearningDialoguePool.ts. Cat scans this via
       *  selectFirstEligibleDialogueCandidate. */
      candidates: ElearningInsightCandidate[];
      /** Home's own existing action logic (mark-read + navigate to
       *  /watch/$videoId) — reused verbatim, never reimplemented here.
       *  Takes the candidate to act on explicitly so Cat always executes
       *  the action (and, critically, marks the correct notification
       *  read) belonging to the exact candidate it is currently showing
       *  (e.g. a dismissal-revealed second unread notification). */
      onAction: (candidate: ElearningInsightCandidate) => void;
    };

interface PersonalizedInsightBridgeContextValue {
  entry: PersonalizedInsightBridgeState | null;
  publish: (entry: PersonalizedInsightBridgeState | null) => void;
}

const PersonalizedInsightBridgeContext = createContext<PersonalizedInsightBridgeContextValue | null>(null);

export function PersonalizedInsightBridgeProvider({ children }: { children: ReactNode }) {
  const [entry, setEntry] = useState<PersonalizedInsightBridgeState | null>(null);
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

/** Home calls this with its current readiness state (not_ready while its
 *  Phase-2 queries are loading, ready+candidate once resolveElearningInsight
 *  has actually run). Publishes on change, reverts to `null` (publisher
 *  absent) on unmount so CatMascot never treats a route the user has left
 *  as still "loading" — see the module header for why this three-way
 *  distinction is the actual fix. */
export function usePublishPersonalizedInsight(state: PersonalizedInsightBridgeState): void {
  const ctx = useContext(PersonalizedInsightBridgeContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.publish(state);
    return () => ctx.publish(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, state]);
}

/** CatMascot calls this — read-only, never publishes. `null` = no
 *  publisher mounted (off-Home route). */
export function usePersonalizedInsightBridge(): PersonalizedInsightBridgeState | null {
  const ctx = useContext(PersonalizedInsightBridgeContext);
  return ctx?.entry ?? null;
}


