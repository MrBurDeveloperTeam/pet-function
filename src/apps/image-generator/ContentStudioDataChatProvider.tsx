"use client";

// Client-side bridge carrying the Dashboard page's ALREADY-SERVER-FETCHED
// `profile`/`recentGenerations` (see src/app/(app)/dashboard/page.tsx) to
// MolarAIFloat, which is mounted as a SIBLING of the page slot inside
// src/app/(app)/layout.tsx — not an ancestor/descendant of DashboardClient,
// so there is no direct prop path between them. This Provider wraps both
// under one Context so DashboardClient can PUBLISH its snapshot and
// MolarAIFloat can READ it, with zero new Supabase query: the data was
// already fetched server-side before DashboardClient ever rendered.
//
// ROUTE-LIMITED AVAILABILITY (by design, not a bug): this snapshot is only
// ever published while DashboardClient is mounted (i.e. the user is on
// /dashboard). Navigating away unmounts DashboardClient, whose cleanup
// effect clears the snapshot back to `not_loaded` for BOTH domains — Data
// Chat on other routes correctly reports "not ready" rather than serving
// stale data.
//
// INDEPENDENT PER-DOMAIN STATUS (hardening): `profile` and
// `recentGenerations` are two SEPARATE Supabase reads in
// dashboard/page.tsx that can fail independently. Treating the whole
// snapshot as one combined `ready` flag would let a failed
// `generations` query silently present as "ready + empty" once
// `recentGenerations ?? []` normalizes it — a false "you don't have any
// generations yet." `planStatus`/`recentGenerationStatus` are tracked
// separately so a failure in one domain never affects the other's
// answerability, and a query failure is never reinterpreted as a known
// empty result. `page.tsx` now passes a boolean `profileHadError`/
// `recentGenerationsHadError` alongside `profile`/`recentGenerations` —
// derived from the SAME Supabase responses it already awaited (their
// `error` field, previously discarded) — not a new read.
//
// REUSES PHASE-2's OWN MINIMIZATION, NOT A NEW PROJECTION: the values
// published here (`plan`, `latestGenerationSelection`) are produced by
// calling Phase-2's own already-audited `projectProfilePlan`/
// `projectGenerationsForInsight`/`selectLatestGeneration`
// (src/aiExperience/utils/*.ts) INSIDE the publish call — the raw
// `Profile`/`Generation[]` objects are never stored in this Context at
// all, so nothing holding a reference to it can ever read a raw prompt,
// output_url, email, or other PII/free-text field.
//
// OWNERSHIP: `ownerUserId` is the id of the user DashboardClient fetched
// this snapshot FOR (passed down explicitly from DashboardPage's own
// `user.id`, itself already fetched via `getUser()` — no new lookup).
// This is intentionally NOT trusted alone — see
// resolveContentStudioDataQuery.ts's ownership gate, which additionally
// requires it to match the CURRENT authenticated user id (passed to
// MolarAIFloat separately from the layout's own `getUser()` call) before
// grounding. See that file's header for why status/ownership alone from
// a single source is insufficient in general (mirrors the Profit
// Calculator repo's own hardening pass), though this app's specific
// architecture (no client-side account switching — see the readiness
// pass) makes the actual risk window narrower than in a client-SPA app.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Profile } from "./types/profile";
import type { Generation } from "./types/generation";
import { projectProfilePlan, type RecognizedPlan } from "./utils/profileProjection";
import {
  projectGenerationsForInsight,
  selectLatestGeneration,
  type LatestGenerationSelection,
  type ProjectedGeneration,
} from "./utils/generationProjection";
import type { ContentStudioSourceStatus } from "./dataChat/contracts/groundedDataResult";

export interface ContentStudioDataChatSnapshot {
  ownerUserId: string | null;
  planStatus: ContentStudioSourceStatus;
  /** `null` is a legitimate value even when `planStatus === 'ready'` —
   *  the raw value may be unrecognized/missing (see profileProjection.ts
   *  — never defaulted to `'free'`). When `planStatus === 'error'`, this
   *  is always `null` — the profile query failed, so no plan value of
   *  any kind (including a fabricated one) is available. */
  plan: RecognizedPlan | null;
  recentGenerationStatus: ContentStudioSourceStatus;
  /** `null` whenever `recentGenerationStatus !== 'ready'` — a failed
   *  generations query never produces a selection, not even an
   *  `{state:'empty'}` one (that state is reserved for a SUCCESSFUL
   *  query that genuinely returned zero rows). */
  latestGenerationSelection: LatestGenerationSelection | null;
  /** The SAME already-minimized projection `latestGenerationSelection`
   *  is itself derived from (Phase-2's own `projectGenerationsForInsight`
   *  — no new query, no new minimization), kept here as a list rather
   *  than collapsed down to one row, so contentstudio_recent_generations_list
   *  can answer "recent generations"/"failed generations"/"recent
   *  activity" from it. `null` under the exact same
   *  `recentGenerationStatus !== 'ready'` condition as
   *  `latestGenerationSelection`. */
  recentGenerationsList: ProjectedGeneration[] | null;
}

const NOT_LOADED_SNAPSHOT: ContentStudioDataChatSnapshot = {
  ownerUserId: null,
  planStatus: "not_loaded",
  plan: null,
  recentGenerationStatus: "not_loaded",
  latestGenerationSelection: null,
  recentGenerationsList: null,
};

interface ContentStudioDataChatContextValue {
  snapshot: ContentStudioDataChatSnapshot;
  publish: (
    ownerUserId: string,
    profile: Profile | null,
    profileHadError: boolean,
    recentGenerations: Generation[] | null,
    recentGenerationsHadError: boolean
  ) => void;
  clear: (ownerUserId: string) => void;
}

const ContentStudioDataChatContext = createContext<ContentStudioDataChatContextValue | null>(null);

export function ContentStudioDataChatProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<ContentStudioDataChatSnapshot>(NOT_LOADED_SNAPSHOT);

  const publish = useCallback(
    (
      ownerUserId: string,
      profile: Profile | null,
      profileHadError: boolean,
      recentGenerations: Generation[] | null,
      recentGenerationsHadError: boolean
    ) => {
      const projected = recentGenerationsHadError ? null : projectGenerationsForInsight(recentGenerations ?? []);
      setSnapshot({
        ownerUserId,
        planStatus: profileHadError ? "error" : "ready",
        plan: profileHadError ? null : projectProfilePlan(profile),
        recentGenerationStatus: recentGenerationsHadError ? "error" : "ready",
        latestGenerationSelection: projected ? selectLatestGeneration(projected) : null,
        recentGenerationsList: projected,
      });
    },
    []
  );

  const clear = useCallback((ownerUserId: string) => {
    // Only clear if the currently-published snapshot still belongs to
    // this exact publish call's owner — an unmount from a stale/
    // superseded publish must never clobber a newer one (mirrors the
    // Profit Calculator repo's own latest-request-wins reasoning, ported
    // to this Provider's simpler publish/clear shape rather than a
    // generation counter, since there is no async fetch in flight here
    // to race against — only React's own effect ordering).
    setSnapshot((prev) => (prev.ownerUserId === ownerUserId ? NOT_LOADED_SNAPSHOT : prev));
  }, []);

  const value = useMemo(() => ({ snapshot, publish, clear }), [snapshot, publish, clear]);

  return <ContentStudioDataChatContext.Provider value={value}>{children}</ContentStudioDataChatContext.Provider>;
}

/** Safe outside a Provider (e.g. the pre-login landing page's disabled
 *  MolarAIFloat instance, which renders outside `(app)/layout.tsx` and
 *  therefore outside this Provider) — returns the same `not_loaded`
 *  snapshot rather than throwing, since "no Data Chat source available
 *  here" is itself a valid, correctly-conservative answer. */
export function useContentStudioDataChatContext(): ContentStudioDataChatContextValue {
  const ctx = useContext(ContentStudioDataChatContext);
  if (ctx) return ctx;
  return { snapshot: NOT_LOADED_SNAPSHOT, publish: () => {}, clear: () => {} };
}
