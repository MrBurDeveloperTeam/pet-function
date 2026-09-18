"use client";

// Smallest bridge to get the already-resolved Phase-2B
// ContentStudioInsightCandidate from DashboardClient.tsx (where
// useContentStudioPersonalizedInsight actually runs) across to CatMascot.jsx
// (mounted inside PetAssistantLayer, a SIBLING of `{children}` in
// src/app/(app)/layout.tsx — not an ancestor/descendant of DashboardClient).
// No new Supabase query, no polling, no realtime — this is a pure read-only
// React Context relay of a value DashboardClient already computed. Mirrors
// the exact same architecture already used by
// src/components/dataChat/ContentStudioDataChatProvider.tsx for the
// identical DashboardClient -> MolarAIFloat relay problem, and the same
// three-way readiness contract already browser-validated in the E-Learning
// repo's PersonalizedInsightBridge.tsx.
//
// THREE-WAY STATE: the context value is `PersonalizedInsightBridgeState |
// null`, where `null` specifically means "no publisher currently mounted"
// (off-Dashboard route, or DashboardClient unmounted) — distinct from
// `{status:'not_ready'}`, which means "the publisher IS mounted and is
// actively telling us its Phase-2 source is still resolving."
//
// MOUNT-ORDER RACE (found + fixed via the identical bug in the Profit
// Calculator repo's PersonalizedInsightBridge.tsx): `DashboardClient`'s
// publish call is an EFFECT (see usePublishPersonalizedInsight below), so
// it can only update `entry` on the render AFTER DashboardClient's own
// first commit — never within it. On a fresh full-page reload that lands
// directly on /dashboard, CatMascot's OWN first-mount arbitration effect
// fires in that SAME initial commit and would read the Provider's bare
// initial `entry` (`null`) BEFORE DashboardClient's effect has had any
// chance to publish — indistinguishable, from `null` alone, from
// "genuinely not on /dashboard". CatMascot's `bridgeState === null` branch
// then commits Welcome Back immediately and permanently
// (arbitrationStartedRef.current = true, a one-shot guard never reset for
// the mount's lifetime) — so DashboardClient's real, correct
// `{status:'ready', candidate: Processing, ...}` publish a moment later is
// simply too late to matter. This is exactly why a reload of an
// undismissed Processing reminder was producing Welcome Back instead of
// the same reminder reappearing — NOT a sessionStorage/seen-key issue
// (that mechanism, sessionDedupe.ts, is unchanged and correct: the
// candidate's dedupeKey is stable and was never actually reached before
// this fix, since arbitration had already committed to Welcome Back).
//
// FIX: `expectPublisher` (below) is derived synchronously from the CURRENT
// ROUTE via `usePathname()` — true only on `/dashboard`, the one route
// DashboardClient ever mounts on. Unlike `entry` (which can only change
// via an effect, one render after mount at the earliest), the pathname is
// known on this Provider's very FIRST render. `usePersonalizedInsightBridge`
// now reports `{status:'not_ready'}` — not `null` — whenever `expectPublisher`
// is true but no real `entry` has been published yet, which CatMascot's
// arbitration already knows how to wait out (see its own `not_ready`
// branch: do nothing yet, may be called again) rather than treating as a
// decision to make. `null` is still returned when `expectPublisher` is
// false — i.e. the user is genuinely not on /dashboard — preserving this
// bridge's existing, intentional "Welcome Back may proceed immediately
// off-Dashboard" behavior, and CatMascot.jsx needed NO changes at all:
// its `bridgeState === null` branch remains correct for that genuine case.
//
// STILL SSR-PROPS, STILL EFFECTIVELY IMMEDIATE ONCE MOUNTED: this app's
// Phase-2 data (`profile`, `recentGenerations`) is fetched SERVER-SIDE in
// src/app/(app)/dashboard/page.tsx and passed to DashboardClient as
// already-resolved props (see useContentStudioPersonalizedInsight.ts's own
// file header) — so once DashboardClient's publish effect actually runs,
// it publishes `'ready'` directly, essentially never a lingering
// `'not_ready'` from DashboardClient itself. The `not_ready` state this
// fix newly makes reachable is the Provider's OWN transient value for the
// one-render gap before that effect runs (and, if Next.js's `loading.tsx`
// for this route segment is still resolving the page's server data,
// pathname already matches `/dashboard` even before DashboardClient exists
// in the tree at all — `expectPublisher` correctly stays true and
// CatMascot correctly keeps waiting through that phase too).
//
// Deliberately route-scoped, not global: a non-`null` state only ever
// exists while DashboardClient is mounted and publishing (see
// usePublishPersonalizedInsight below, called only from DashboardClient).
// On any other route, `entry` reverts to `null` and `expectPublisher` is
// false — intentional, per the task's own instruction not to add a global
// fetch just to make the reminder available everywhere.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ContentStudioInsightCandidate } from '../resolver/resolveContentStudioInsight';

export type PersonalizedInsightBridgeState =
  | { status: 'not_ready' }
  | {
      status: 'ready';
      candidate: ContentStudioInsightCandidate | null;
      /** DashboardClient's own existing action handler
       *  (handleContentStudioInsightAction) — reused verbatim, never
       *  reimplemented here. Takes the candidate to act on explicitly
       *  (rather than closing over whichever candidate DashboardClient's
       *  own render most recently resolved) so a caller — Cat included —
       *  always executes the action (and, for Processing, navigates to
       *  the correct generation) belonging to the exact candidate it is
       *  currently showing, even when that differs from the inline
       *  banner's own current winner. */
      onAction: (candidate: ContentStudioInsightCandidate) => void;
    };

interface PersonalizedInsightBridgeContextValue {
  entry: PersonalizedInsightBridgeState | null;
  publish: (entry: PersonalizedInsightBridgeState | null) => void;
  /** True while the current route is `/dashboard` — i.e. DashboardClient
   *  either already is, or is about to be, the active publisher, even
   *  though its publish effect hasn't necessarily run yet. Known
   *  synchronously from `usePathname()` during render, unlike `entry`
   *  itself. See usePersonalizedInsightBridge's own doc for why this
   *  closes the mount-order race. */
  expectPublisher: boolean;
}

const PersonalizedInsightBridgeContext = createContext<PersonalizedInsightBridgeContextValue | null>(null);

export function PersonalizedInsightBridgeProvider({ children, pathname }: { children: ReactNode; pathname: string | null }) {
  const [entry, setEntry] = useState<PersonalizedInsightBridgeState | null>(null);
  const expectPublisher = pathname === '/dashboard';
  const contextValue = useMemo(
    () => ({ entry, publish: setEntry, expectPublisher }),
    [entry, expectPublisher]
  );
  return (
    <PersonalizedInsightBridgeContext.Provider value={contextValue}>
      {children}
    </PersonalizedInsightBridgeContext.Provider>
  );
}

/** DashboardClient calls this with its current readiness state. Publishes
 *  on change, reverts to `null` (publisher absent) on unmount so CatMascot
 *  never treats a route the user has left as still "loading". */
export function usePublishPersonalizedInsight(state: PersonalizedInsightBridgeState): void {
  const ctx = useContext(PersonalizedInsightBridgeContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.publish(state);
    return () => ctx.publish(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, state]);
}

/**
 * CatMascot calls this — read-only, never publishes.
 *
 * See the file header for the full mount-order race this fixes. While
 * `expectPublisher` is true (route is `/dashboard`) and no `entry` has
 * actually been published yet, reports `{status:'not_ready'}` instead of
 * `null`. `null` is returned only when `expectPublisher` is false — the
 * user is genuinely not on /dashboard — preserving the existing,
 * intentional "Welcome Back may proceed immediately off-Dashboard"
 * behavior unchanged.
 */
export function usePersonalizedInsightBridge(): PersonalizedInsightBridgeState | null {
  const ctx = useContext(PersonalizedInsightBridgeContext);
  if (!ctx) return null;
  if (ctx.entry !== null) return ctx.entry;
  return ctx.expectPublisher ? { status: 'not_ready' } : null;
}
