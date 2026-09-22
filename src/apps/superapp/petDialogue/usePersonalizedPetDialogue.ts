import { useCallback, useEffect, useRef, useState } from 'react';
import { getSuperappHostDependencies } from '../dependencies';
import { resolvePersonalizedDialogue } from './resolveDialogue';
import { fetchInventoryDialogueEvaluation } from './providers/inventorySnapshotProvider';
import { fetchTodoDialogueEvaluation } from './providers/todoSnapshotProvider';
import { fetchAppointmentDialogueEvaluation } from './providers/appointmentSnapshotProvider';
import { buildProfileCandidate } from './providers/profileProvider';
import { fetchLegacyIntroCandidate } from './providers/legacyIntroProvider';
import { buildSuperappWelcomeBackMessage, resolveSafeDisplayName } from './nameResolution';
import { isDialogueIneligible, markDialogueDismissed, markDialogueSeenThisSession } from './sessionDedupe';
import { selectFirstEligibleDialogueCandidate } from './selectDialogueCandidate';
import { getInventoryAppRoute, getTodoAppRoute, getAppointmentAppRoute, getProfileSettingsRoute } from './knownRoutes';
import { toCalendarDateKey } from './dateUtils';
import {
  DIALOGUE_ID,
  PET_DIALOGUE_RULE_VERSION,
  type DialogueCandidate,
  type InsightCandidate,
  type PersonalizedDialogueLifecycle,
  type ProfileCompletionStatus,
} from './types';

const DEFAULT_FALLBACK_AUTO_CLOSE_MS = 6000;

export interface WelcomeFallbackFacts {
  userId: string;
  displayName: string | null;
  messageSource: 'hardcoded_fallback';
}

interface UsePersonalizedPetDialogueOptions {
  /** Feature flag enabled AND the user is logged in (mirrors CatMascot's `!disabled`). */
  active: boolean;
  /**
   * The Supabase Auth user id that App.tsx's reconcileSupabaseIdentity has
   * confirmed belongs to the same account as the currently Odoo-verified
   * user. Three states: `undefined` = reconciliation still in progress /
   * not yet attempted (stay neutral — never guess); `null` = confirmed
   * guest, or a failed/mismatched reconciliation (safe to show the neutral
   * fallback); a string = the confirmed-matched Supabase user id. This
   * hook never independently reads `supabase.auth.getSession()` to decide
   * *whose* evaluation to run — App.tsx is the single owner of Odoo/
   * Supabase identity reconciliation; this is the one canonical signal
   * consumed here.
   */
  matchedUserId: string | null | undefined;
  profileStatus: ProfileCompletionStatus;
  /** Reads the existing `intro_shown_{userId}` localStorage flag — owned by CatMascot, not duplicated here. */
  introAlreadyCompleted: (userId: string) => boolean;
  onNavigateInternal?: (path: string) => void;
}

export interface PersonalizedDialogueSelection {
  candidate: DialogueCandidate;
  /** Populated only when the resolved candidate is the legacy post-login intro. */
  introSteps: string[];
}

function buildFallbackCandidate(params: {
  userId: string;
  profileName?: string | null;
  profileFullName?: string | null;
  metaName?: string | null;
  email?: string | null;
  autoCloseMs: number;
}): InsightCandidate<WelcomeFallbackFacts> {
  const displayName = resolveSafeDisplayName(params);
  const message = buildSuperappWelcomeBackMessage(params);

  const evaluatedAt = new Date().toISOString();
  const facts: WelcomeFallbackFacts = {
    userId: params.userId,
    displayName,
    messageSource: 'hardcoded_fallback',
  };

  return {
    // Neutral, no-urgent-condition fallback — not tied to any one mini-app
    // (see legacyIntroProvider.ts's identical reasoning for 'legacy').
    app: 'system',
    triggerId: DIALOGUE_ID.WELCOME_FALLBACK,
    facts,
    messageTemplate: 'Welcome back, {displayName}! 👋',
    sourceRecordId: params.userId,
    evaluatedAt,
    userState: 'GENERAL_USER_NO_URGENT',
    dialogueId: DIALOGUE_ID.WELCOME_FALLBACK,
    priority: 'FALLBACK',
    message,
    source: { app: 'gallery', evaluatedAt },
    dedupeKey: `welcome_fallback:${params.userId}`,
    ruleVersion: PET_DIALOGUE_RULE_VERSION,
    autoCloseMs: params.autoCloseMs,
    recordId: params.userId,
  };
}

/**
 * Orchestrates Phase 1A candidate evaluation and deterministic selection.
 * Pure resolution logic lives in resolveDialogue.ts; this hook is only
 * responsible for fetching candidates, guarding against stale/late
 * responses, and locking the final selection for the current mount.
 *
 * Identity lifecycle: every evaluation is owned by exactly one resolved,
 * reconciled user id (`matchedUserId`, supplied by App.tsx — see
 * reconcileSupabaseIdentity), one generation, and one AbortController.
 * `matchedUserId` is a required dependency of the evaluation effect,
 * specifically so an identity change that doesn't happen to also flip
 * `active` or `profileStatus` — e.g. a cross-tab account switch, or an Odoo
 * re-verification whose Supabase session hadn't caught up yet — still
 * restarts evaluation. This hook deliberately does not re-derive or
 * independently verify identity matching itself: App.tsx is the single
 * owner of that reconciliation (see Section 4/11 of the identity
 * reconciliation task this comment originates from) — duplicating it here
 * would be a second, potentially-divergent implementation of the same
 * check.
 */
export function usePersonalizedPetDialogue({
  active,
  matchedUserId,
  profileStatus,
  introAlreadyCompleted,
  onNavigateInternal,
}: UsePersonalizedPetDialogueOptions) {
  const { supabase, useCreateAppLink, getAuthUser } = getSuperappHostDependencies();
  const [lifecycle, setLifecycle] = useState<PersonalizedDialogueLifecycle>('idle');
  const [selection, setSelection] = useState<PersonalizedDialogueSelection | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const generationRef = useRef(0);
  const lockedUserIdRef = useRef<string | null>(null);
  const { mutateAsync: createAppLink } = useCreateAppLink();

  // Mirrors the `matchedUserId` prop synchronously during render (not via a
  // separate effect, which would lag a tick behind) — defense-in-depth so
  // an in-flight evaluation's stale check can observe an identity change
  // the instant this component re-renders with a new prop value, not only
  // after this hook's own effect has had a chance to clean up and restart.
  const latestMatchedUserIdRef = useRef(matchedUserId);
  latestMatchedUserIdRef.current = matchedUserId;

  // Appointment eligibility changes purely as clinic-device time advances,
  // with no data change to react to — so, unlike every other provider here,
  // it needs an explicit "re-evaluate now" trigger beyond identity/profile
  // changes. `refreshTick` is that trigger: bumped (debounced/coalesced) on
  // window focus and document visibility, gated to only when a real
  // identity is confirmed matched. It's just another dependency of the same
  // evaluation effect below, so it reuses 100% of the existing generation/
  // abort/staleness machinery — a refresh is exactly a normal re-run, not a
  // separate code path. Per the approved Phase scope: no interval polling,
  // no per-minute timer — a continuously focused page will not itself cross
  // the two-hour threshold until one of these triggers (or a
  // matchedUserId/profileStatus change) fires again.
  const [refreshTick, setRefreshTick] = useState(0);
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active || typeof matchedUserId !== 'string') return;

    const REFRESH_DEBOUNCE_MS = 1000;
    const scheduleRefresh = () => {
      if (refreshDebounceRef.current !== null) clearTimeout(refreshDebounceRef.current);
      refreshDebounceRef.current = setTimeout(() => {
        refreshDebounceRef.current = null;
        setRefreshTick((t) => t + 1);
      }, REFRESH_DEBOUNCE_MS);
    };

    const onFocus = () => scheduleRefresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (refreshDebounceRef.current !== null) {
        clearTimeout(refreshDebounceRef.current);
        refreshDebounceRef.current = null;
      }
    };
  }, [active, matchedUserId]);

  useEffect(() => {
    if (!active) {
      setLifecycle('idle');
      setSelection(null);
      setUserId(null);
      lockedUserIdRef.current = null;
      return;
    }

    if (matchedUserId === undefined) {
      // App.tsx is still reconciling Odoo/Supabase identity (or hasn't
      // attempted it yet for the current Odoo session) — stay neutral
      // rather than guessing; this effect re-runs the instant App.tsx
      // resolves it (to a matched id, or a confirmed `null`), since
      // `matchedUserId` is a dependency.
      setLifecycle('loading');
      setSelection(null);
      setUserId(null);
      lockedUserIdRef.current = null;
      return;
    }

    // Captured once per generation — every check below compares against
    // this frozen value, never against the live `matchedUserId` closure
    // variable (which belongs to whichever render scheduled this effect,
    // not to "right now").
    const capturedUserId = matchedUserId;
    const generation = ++generationRef.current;
    const controller = new AbortController();
    let cancelled = false;

    setLifecycle('loading');
    setSelection(null);
    // Set synchronously (not lazily inside the async run() below) so
    // `userId` — exposed to CatMascot as `personalizedUserId` — reflects
    // the identity change in the same commit the evaluation restarts, not
    // only once a new async evaluation eventually resolves. This is what
    // lets CatMascot detect "the user changed" promptly enough to tear
    // down an already-adopted previous-user dialogue.
    setUserId(capturedUserId);
    lockedUserIdRef.current = capturedUserId;

    // Generation match is the primary guard (bumped on every effect
    // restart, including every matchedUserId change). The identity-ref
    // comparison is deliberate defense-in-depth per the required lifecycle
    // guarantee — never rely on generation matching alone to prove the
    // captured user is still current.
    const isStale = () => cancelled || generation !== generationRef.current || latestMatchedUserIdRef.current !== capturedUserId;

    if (!capturedUserId) {
      // No confirmed-matched identity — either a guest, or Odoo/Supabase
      // identity reconciliation hasn't completed (or failed/mismatched).
      // Not enough *trustworthy* identity to safely scope any query, so go
      // straight to the hardcoded fallback rather than guessing at another
      // account's data or querying with a not-yet-confirmed session.
      setLifecycle('failed');
      setSelection({
        candidate: buildFallbackCandidate({ userId: 'anonymous', autoCloseMs: DEFAULT_FALLBACK_AUTO_CLOSE_MS }),
        introSteps: [],
      });
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const run = async () => {
      try {
        // Cosmetic display-name inputs only (never the identity/security
        // boundary — that's `capturedUserId`, already confirmed matched by
        // App.tsx). Reading the session fresh here is safe: by definition
        // `capturedUserId` is non-null only once App.tsx has confirmed the
        // current Supabase session belongs to this exact account.
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (isStale()) return;
        const metaName = (session?.user?.user_metadata as { name?: string } | undefined)?.name ?? null;
        const email = session?.user?.email ?? null;

        const fetchDisplayNameProfile = async (): Promise<{ name?: string | null; full_name?: string | null } | null> => {
          try {
            const { data } = await supabase
              .from('profiles')
              .select('name, full_name')
              .eq('user_id', capturedUserId)
              .maybeSingle();
            return data;
          } catch {
            return null;
          }
        };

        // One local clock snapshot for the whole evaluation — Todo's
        // localToday and the Appointment provider's query window/2-hour
        // check all derive from this same instant, so a single evaluation
        // is always internally consistent even if it happens to straddle
        // local midnight while in flight (a later refresh — see
        // refreshTick above — captures a fresh instant for its own run).
        const evaluationNow = new Date();
        const localToday = toCalendarDateKey(evaluationNow);

        const [inventoryResult, todoResult, appointmentResult, introResult, profileRow] = await Promise.all([
          fetchInventoryDialogueEvaluation(capturedUserId, controller.signal),
          fetchTodoDialogueEvaluation(capturedUserId, localToday, controller.signal),
          fetchAppointmentDialogueEvaluation(capturedUserId, evaluationNow, controller.signal),
          fetchLegacyIntroCandidate(capturedUserId, introAlreadyCompleted(capturedUserId), controller.signal),
          fetchDisplayNameProfile(),
        ]);

        if (isStale()) return;

        if (inventoryResult.status === 'aborted' || todoResult.status === 'aborted' || appointmentResult.status === 'aborted') {
          // The shared per-evaluation controller was aborted (unmount, user
          // change, or a newer generation) — isStale() above should already
          // have caught this, but bail out explicitly rather than act on a
          // cancelled evaluation's result under any circumstance.
          return;
        }

        const fallback = buildFallbackCandidate({
          userId: capturedUserId,
          profileName: profileRow?.name,
          profileFullName: profileRow?.full_name,
          metaName,
          email,
          autoCloseMs: DEFAULT_FALLBACK_AUTO_CLOSE_MS,
        });

        // Profile completion is the first decision in the main-page Pet
        // specification. Wait for the authoritative Odoo result; do not let
        // an urgent candidate (or a failing mini-app query) bypass a known
        // incomplete profile. Unknown is not evidence of incompleteness.
        if (profileStatus === 'loading') return;
        if (profileStatus === 'unknown') {
          if (isStale()) return;
          setLifecycle('failed');
          setSelection({ candidate: fallback, introSteps: [] });
          return;
        }
        const profileCandidateRaw = buildProfileCandidate(profileStatus, capturedUserId);
        const profileCandidate = isDialogueIneligible(capturedUserId, profileCandidateRaw?.dedupeKey ?? '')
          ? null
          : profileCandidateRaw;
        if (profileCandidate) {
          if (isStale()) return;
          setLifecycle('ready');
          setSelection({ candidate: profileCandidate, introSteps: [] });
          return;
        }

        if (inventoryResult.status === 'failed' || todoResult.status === 'failed' || appointmentResult.status === 'failed') {
          // A provider failure is never "no urgent inventory/tasks/
          // appointments exist" — it's unknown. With three independent
          // urgent-data providers now in play, any one failing must fail
          // the whole evaluation closed: never show P0/P1/P2/Intro
          // while a real P0/P1 could be hidden behind another provider's
          // failure. Go straight to the neutral fallback (no timeout/error
          // wording — buildFallbackCandidate's message is identical
          // regardless of why the evaluation couldn't be trusted).
          if (inventoryResult.status === 'failed') {
            console.warn('[petDialogue] inventory evaluation failed, reason:', inventoryResult.reason);
          }
          if (todoResult.status === 'failed') {
            console.warn('[petDialogue] todo evaluation failed, reason:', todoResult.reason);
          }
          if (appointmentResult.status === 'failed') {
            console.warn('[petDialogue] appointment evaluation failed, reason:', appointmentResult.reason);
          }
          if (isStale()) return;
          setLifecycle('failed');
          setSelection({ candidate: fallback, introSteps: [] });
          return;
        }

        const { expiredCandidates, expiringSoonCandidates, lowStockCandidates } = inventoryResult.candidate!;
        const { overdueCandidates, taskTodayCandidates } = todoResult.candidate!;
        const { appointmentSoonCandidates } = appointmentResult.candidate!;

        // Explicit P0 subtype rank: expired inventory always outranks an
        // overdue High task. Resolved here, before either reaches the
        // shared resolver, so resolveDialogue.ts never has to compare an
        // inventory expiry date against a Todo task date — at most one P0
        // candidate is ever passed into it.
        //
        // Dismissal-aware pool scan (starvation fix): each family may have
        // several simultaneously business-eligible records (e.g. two
        // independently expired items). The provider already returns them
        // in business order (see expiredInventoryProvider.ts /
        // overdueTaskProvider.ts); selectFirstEligibleDialogueCandidate just
        // skips session-seen/dismissed entries and returns the first
        // remaining one, so dismissing the winner reveals the next
        // same-family candidate instead of incorrectly falling through to a
        // lower-priority family. No queueing: this is re-evaluated once per
        // activation cycle, same as the single-candidate check it replaces.
        const unhandledExpired = selectFirstEligibleDialogueCandidate(capturedUserId, expiredCandidates);
        const unhandledOverdueTask = selectFirstEligibleDialogueCandidate(capturedUserId, overdueCandidates);
        const p0 = unhandledExpired ?? unhandledOverdueTask;

        if (p0) {
          // Profile is already resolved above; P0 wins over every remaining
          // candidate family.
          if (isStale()) return;
          setLifecycle('ready');
          setSelection({ candidate: p0, introSteps: [] });
          return;
        }

        // Explicit P1 subtype rank: Appointment Within 2 Hours always
        // outranks High Task Today. Resolved here, before either ever
        // reaches the shared resolver, exactly like the P0 subtypes above —
        // an appointment start instant is never compared against a Todo
        // due-date to decide this.
        const unhandledAppointmentSoon = selectFirstEligibleDialogueCandidate(capturedUserId, appointmentSoonCandidates);
        const unhandledHighTaskToday = selectFirstEligibleDialogueCandidate(capturedUserId, taskTodayCandidates);
        const p1 = unhandledAppointmentSoon ?? unhandledHighTaskToday;

        if (p1) {
          // P1 wins after Profile and P0 have both been ruled out.
          if (isStale()) return;
          setLifecycle('ready');
          setSelection({ candidate: p1, introSteps: [] });
          return;
        }

        // Dismissal dedupe is applied independently to each P2 subtype before
        // choosing between them — a handled Low Stock must not block an
        // otherwise-eligible Expiring Soon candidate on a different item,
        // and vice versa.
        const unhandledLowStock = selectFirstEligibleDialogueCandidate(capturedUserId, lowStockCandidates);
        const unhandledExpiringSoon = selectFirstEligibleDialogueCandidate(capturedUserId, expiringSoonCandidates);

        // Explicit P2 subtype rank (approved reversal): Low Stock now
        // outranks Expiring Soon. Resolved here, before either ever reaches
        // the shared resolver, so resolveDialogue.ts never has to compare a
        // quantity-based candidate (no eventTime) against an expiry date.
        const p2 = unhandledLowStock ?? unhandledExpiringSoon;

        // Priority ordering (P2 > LEGACY_INTRO > FALLBACK) lives
        // entirely in resolveDialogue.ts's PRIORITY_RANK.
        const resolved = resolvePersonalizedDialogue([p2, introResult.candidate], fallback);

        if (isStale()) return;
        setLifecycle('ready');
        setSelection({
          candidate: resolved,
          introSteps: resolved.dialogueId === DIALOGUE_ID.LEGACY_POST_LOGIN_INTRO ? introResult.steps : [],
        });
      } catch (err) {
        if (isStale()) return;
        console.warn('[petDialogue] evaluation failed, using fallback:', err);
        setLifecycle('failed');
        setSelection({
          candidate: buildFallbackCandidate({
            userId: capturedUserId,
            autoCloseMs: DEFAULT_FALLBACK_AUTO_CLOSE_MS,
          }),
          introSteps: [],
        });
      }
    };

    run();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // profileStatus is intentionally a dependency: while it's 'loading' the
    // run above returns early, then re-runs once the authoritative status
    // arrives so PROFILE can outrank every urgent candidate.
    // matchedUserId is intentionally a dependency: it's the sole identity
    // signal this effect restarts on — see the hook-level comment above for
    // why active/profileStatus alone are not sufficient, and why this hook
    // consumes App.tsx's reconciled identity rather than tracking its own.
    // refreshTick is intentionally a dependency: it's the sole trigger for
    // re-evaluating Appointment eligibility as clinic-device time advances
    // (see the focus/visibility effect above) — a refresh is just another
    // ordinary re-run of this same effect, gaining the exact same
    // generation/abort/staleness guarantees as every other restart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, matchedUserId, profileStatus, refreshTick]);

  // Show-time mark: same-tab/session ONLY (sessionStorage). Merely
  // displaying a candidate must never suppress it in another tab — only an
  // explicit Close or CTA does that (see runAction below, and
  // CatMascot.tsx's closeDialog).
  const markShown = useCallback((candidate: DialogueCandidate) => {
    const uid = lockedUserIdRef.current;
    if (!uid) return;
    if (
      candidate.priority === 'P0' ||
      candidate.priority === 'PROFILE' ||
      candidate.priority === 'P1' ||
      candidate.priority === 'P2'
    ) {
      markDialogueSeenThisSession(uid, candidate.dedupeKey);
    }
  }, []);

  const advanceRound = useCallback(() => setRefreshTick((tick) => tick + 1), []);

  const runAction = useCallback(
    async (candidate: DialogueCandidate) => {
      // CTA = explicit user action: write the cross-tab dismissal FIRST,
      // synchronously, before any navigation below.
      const uid = lockedUserIdRef.current;
      if (uid) markDialogueDismissed(uid, candidate.dedupeKey);

      if (candidate.dialogueId === DIALOGUE_ID.PROFILE_INCOMPLETE) {
        onNavigateInternal?.(getProfileSettingsRoute());
        return;
      }

      if (
        candidate.dialogueId === DIALOGUE_ID.EXPIRED_INVENTORY ||
        candidate.dialogueId === DIALOGUE_ID.INVENTORY_EXPIRING_SOON ||
        candidate.dialogueId === DIALOGUE_ID.INVENTORY_LOW_STOCK
      ) {
        const authUser = getAuthUser();
        // Open the tab synchronously (before any await) so popup blockers
        // treat it as part of the click gesture — same pattern as AppCard.
        const w = window.open('', '_blank');
        if (!authUser?.username) {
          if (w) w.location.href = getInventoryAppRoute();
          return;
        }
        try {
          const res = (await createAppLink({ app: 'inventory', email: authUser.username, name: authUser.name })) as {
            result?: { url?: string };
          };
          const url = res?.result?.url;
          if (w) w.location.href = url || getInventoryAppRoute();
        } catch {
          if (w) w.location.href = getInventoryAppRoute();
        }
        return;
      }

      if (candidate.dialogueId === DIALOGUE_ID.OVERDUE_HIGH_TASK || candidate.dialogueId === DIALOGUE_ID.HIGH_TASK_TODAY) {
        const authUser = getAuthUser();
        // Same pattern as the Inventory branch above — always the Todo
        // landing page, never a task-detail path (no such controlled route
        // exists).
        const w = window.open('', '_blank');
        if (!authUser?.username) {
          if (w) w.location.href = getTodoAppRoute();
          return;
        }
        try {
          const res = (await createAppLink({ app: 'todo', email: authUser.username, name: authUser.name })) as {
            result?: { url?: string };
          };
          const url = res?.result?.url;
          if (w) w.location.href = url || getTodoAppRoute();
        } catch {
          if (w) w.location.href = getTodoAppRoute();
        }
        return;
      }

      if (candidate.dialogueId === DIALOGUE_ID.APPOINTMENT_SOON) {
        const authUser = getAuthUser();
        // Same pattern as the Inventory/Todo branches above — always the
        // Appointment landing page, never a record-specific route (no such
        // controlled destination exists).
        const w = window.open('', '_blank');
        if (!authUser?.username) {
          if (w) w.location.href = getAppointmentAppRoute();
          return;
        }
        try {
          const res = (await createAppLink({ app: 'appointment', email: authUser.username, name: authUser.name })) as {
            result?: { url?: string };
          };
          const url = res?.result?.url;
          if (w) w.location.href = url || getAppointmentAppRoute();
        } catch {
          if (w) w.location.href = getAppointmentAppRoute();
        }
        return;
      }

      // Unknown dialogueId — should never happen for a resolver-produced
      // candidate. Deliberately do nothing rather than trusting an
      // unvalidated route string.
    },
    [onNavigateInternal, createAppLink]
  );

  return { lifecycle, selection, userId, markShown, runAction, advanceRound };
}
