'use client';

import { useEffect, useRef, useState } from 'react';
import type { DialogueCandidate } from '../contracts';
import type { CatDialoguePresentation } from './presentation';
import type { DialogueRuntimeInput, DialogueRuntimeResult } from './dialogueRuntime.types';
import { CAT_ENTRY_WALK_DURATION_MS, DEFAULT_WELCOME_BACK_AUTO_CLOSE_MS } from './internal/timing';
import { isDismissed, markDismissed, matchesDismissalKey } from './internal/dismissal';
import { isIntroCompleted, markIntroCompleted } from './internal/introCompletion';

type DialogType = 'intro' | 'welcomeBack' | 'personalized' | null;

/**
 * Shared Cat dialogue lifecycle engine.
 *
 * Ported from Content Studio's pre-Phase-3B `CatMascot.jsx` controller —
 * every mechanic below (mount-scoped shown-state, dismissal persistence,
 * cross-tab sync, exact-adopted-candidate binding, one-activation/no-
 * cascade, readiness handling) is preserved exactly, not redesigned. Only
 * the inputs changed shape: instead of the host imperatively fetching
 * Supabase data and calling internal functions, the host now supplies
 * already-resolved, reactive `DialogueRuntimeInput` values and this hook
 * reacts to them via plain React effects — no polling anywhere.
 *
 * Business logic that stays entirely host-side (never appears here):
 * candidate generation, candidate ordering/eligibility beyond the generic
 * shown/dismissed check, Intro/Welcome Back CONTENT fetching, profile/name
 * resolution, routing, and any Supabase/AIBoard read.
 */
export function useSharedCatDialogueRuntime<
  TCandidate extends DialogueCandidate = DialogueCandidate
>(input: DialogueRuntimeInput<TCandidate>): DialogueRuntimeResult {
  const { appId, userId, disabled = false, intro, personalized, welcomeBack } = input;

  const [dialogSteps, setDialogSteps] = useState<string[]>([]);
  const [dialogStepIdx, setDialogStepIdx] = useState(0);
  const [isDialogActive, setIsDialogActive] = useState(false);
  const [activeCandidate, setActiveCandidate] = useState<TCandidate | null>(null);

  const currentDialogType = useRef<DialogType>(null);
  const dismissedDialogs = useRef<Set<Exclude<DialogType, null>>>(new Set());
  // In-memory, mount-scoped ONLY — never persisted. A candidate merely
  // SHOWN (never explicitly Closed/CTA'd) must remain eligible again on
  // the next reload; only explicit dismissal (below, in localStorage)
  // survives reload. No sessionStorage anywhere in this file.
  const shownCandidateKeysRef = useRef<Set<string>>(new Set());
  const activeCandidateRef = useRef<TCandidate | null>(null);
  // Captured at adoption time, never re-read live at CTA-click time — see
  // the CTA handler in `dialogue` below.
  const activeOnActionRef = useRef<((candidate: TCandidate) => void | Promise<void>) | null>(null);
  const arbitrationStartedRef = useRef(false);
  const isDialogActiveRef = useRef(false);
  const isEntryWalkComplete = useRef(false);
  const phaseDecidedRef = useRef(false);
  const welcomeBackPhaseEnteredRef = useRef(false);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const welcomeBackAutoCloseMsRef = useRef(DEFAULT_WELCOME_BACK_AUTO_CLOSE_MS);

  const clearWelcomeBackAutoCloseTimer = () => {
    if (autoCloseTimerRef.current !== null) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  };

  const startWelcomeBackAutoCloseTimer = () => {
    clearWelcomeBackAutoCloseTimer();
    const configured = Number(welcomeBackAutoCloseMsRef.current);
    const duration = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_WELCOME_BACK_AUTO_CLOSE_MS;
    autoCloseTimerRef.current = setTimeout(() => {
      autoCloseTimerRef.current = null;
      closeDialog();
    }, duration);
  };

  // persistDismissal defaults to true (Close, CTA, and Cat-click-while-
  // open all count as this tab finishing with the dialogue). The ONE
  // caller that must NOT write again is the cross-tab `storage` listener
  // below — the key is already present in shared localStorage (that's
  // what fired the event), so re-writing would be a pointless redundant
  // write; persistDismissal: false keeps that a pure local-UI suppression.
  const closeDialog = (options?: { persistDismissal?: boolean }) => {
    const persistDismissal = options?.persistDismissal ?? true;
    const dialogType = currentDialogType.current;
    if (dialogType) dismissedDialogs.current.add(dialogType);
    if (persistDismissal && dialogType === 'personalized') {
      const candidate = activeCandidateRef.current;
      if (candidate && userId) markDismissed(appId, userId, candidate.dedupeKey);
    }
    isDialogActiveRef.current = false;
    setIsDialogActive(false);
    if (dialogType === 'personalized') {
      activeCandidateRef.current = null;
      activeOnActionRef.current = null;
      setActiveCandidate(null);
    }
    clearWelcomeBackAutoCloseTimer();
    if (dialogType === 'intro' && !disabled && userId) markIntroCompleted(userId);
  };

  // Single source of truth for showing a prepared dialog: only activates
  // once the entry walk has finished AND a dialog type has been prepared
  // AND that specific type hasn't already been dismissed this activation.
  // Idempotent via isDialogActiveRef.
  const tryActivateDialog = () => {
    const dialogType = currentDialogType.current;
    if (!isEntryWalkComplete.current || !dialogType || dismissedDialogs.current.has(dialogType) || isDialogActiveRef.current) {
      return;
    }
    isDialogActiveRef.current = true;
    setIsDialogActive(true);
    if (dialogType === 'welcomeBack') {
      startWelcomeBackAutoCloseTimer();
    } else if (dialogType === 'personalized') {
      const candidate = activeCandidateRef.current;
      if (candidate) shownCandidateKeysRef.current.add(candidate.dedupeKey);
    }
  };

  // Entry-walk gate: mirrors SharedCatMascot's own internal entry-walk
  // duration via the shared CAT_ENTRY_WALK_DURATION_MS constant, so a
  // dialogue bubble never appears mid-walk.
  useEffect(() => {
    const t = setTimeout(() => {
      isEntryWalkComplete.current = true;
      tryActivateDialog();
    }, CAT_ENTRY_WALK_DURATION_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase decision: mutually exclusive per activation, exactly as the
  // pre-extraction controller — if Intro is not yet completed for this
  // identity, this activation resolves ONLY Intro (marking it complete if
  // there's no content, with Personalized/Welcome Back deferred to the
  // NEXT reload). If already completed, this activation never touches
  // Intro and goes straight to the returning-user arbitration effect below.
  useEffect(() => {
    if (phaseDecidedRef.current) return;
    if (!disabled && userId && isIntroCompleted(userId)) {
      phaseDecidedRef.current = true;
      return; // returning-user phase — handled by the arbitration effect
    }
    if (!intro) return; // host has no Intro concept — wait forever
    if (intro.status !== 'ready') return;
    phaseDecidedRef.current = true;
    const steps = intro.steps ?? [];
    if (steps.length > 0) {
      setDialogSteps(steps);
      setDialogStepIdx(0);
      currentDialogType.current = 'intro';
      tryActivateDialog();
    } else if (!disabled && userId) {
      markIntroCompleted(userId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, userId, intro?.status, intro?.steps]);

  // Returning-user arbitration: deterministic, reads the personalized
  // adapter's explicit three-way state (never treats a bare `null`/
  // `not_ready` as proof of readiness) and only ever decides once per
  // activation, regardless of resolution speed.
  //
  // Two distinct "no personalized candidate yet" signals, deliberately NOT
  // collapsed into one:
  //   - `personalized` itself absent (omitted/undefined/null) means the
  //     host has no personalized/proactive reminder concept at all (see
  //     DialogueRuntimeInput's own doc comment on `personalized`) — a
  //     permanent fact for this host for the whole mount, so it has always
  //     been correct to fall straight through to Welcome Back here.
  //   - `personalized` PRESENT but `.state` not yet a valid
  //     `PersonalizedDialogueState` (i.e. out-of-contract `null`/
  //     `undefined`, which `state`'s type never actually allows, but a
  //     plain-JS host can still pass at runtime) is instead the transient
  //     window before that host's own reactive publisher has rendered even
  //     once — e.g. a React Context whose provider defaults to `null`
  //     until a sibling component's `useEffect` first calls `publish(...)`.
  //     Effects never run before the very first commit, so a host using
  //     that pattern is GUARANTEED to render this hook with `state: null`
  //     on every cold mount, not merely as an edge case. Treating that as
  //     terminal here silently and permanently latched Welcome Back before
  //     the host's real `not_ready` → `ready` transition — including a
  //     real P0 candidate — ever got a chance to be observed (proven
  //     against To-Do Manager's Overdue-High-Task Cat reminder). Treat it
  //     exactly like `not_ready` instead: wait, do not latch, let this
  //     effect naturally re-run once the host's own state settles into a
  //     real contract value.
  useEffect(() => {
    if (disabled || !userId) return;
    if (currentDialogType.current) return;
    if (arbitrationStartedRef.current) return;
    if (!isIntroCompleted(userId)) return;

    if (personalized == null) {
      arbitrationStartedRef.current = true;
      welcomeBackPhaseEnteredRef.current = true;
      return;
    }

    const personalizedState = personalized.state;

    if (personalizedState == null || personalizedState.status === 'not_ready') {
      // Genuinely unresolved, or the host's adapter is present but hasn't
      // rendered a valid state yet (see comment above) — do nothing yet,
      // may be called again.
      return;
    }

    // status === 'ready': scan the host's already-ordered pool for the
    // first candidate not shown this mount and not dismissed. Never
    // re-sorted, never interpreted beyond dedupeKey.
    const candidates = personalizedState.candidates ?? [];
    const eligible = candidates.find(
      (c) => c.dedupeKey && !shownCandidateKeysRef.current.has(c.dedupeKey) && !isDismissed(appId, userId, c.dedupeKey)
    );

    if (eligible) {
      arbitrationStartedRef.current = true;
      activeCandidateRef.current = eligible;
      activeOnActionRef.current = personalized?.onAction ?? null;
      setActiveCandidate(eligible);
      currentDialogType.current = 'personalized';
      tryActivateDialog();
      return;
    }

    arbitrationStartedRef.current = true;
    welcomeBackPhaseEnteredRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalized?.state, userId, disabled]);

  // Welcome Back content: only acts once the arbitration effect above has
  // entered the Welcome Back phase, and only once the host's reactive
  // `welcomeBack` input reports `'ready'`.
  useEffect(() => {
    if (!welcomeBackPhaseEnteredRef.current) return;
    if (currentDialogType.current) return; // already showing something
    if (!welcomeBack) return; // host has no Welcome Back concept
    if (welcomeBack.status !== 'ready') return;
    if (!welcomeBack.message) return;
    setDialogSteps([welcomeBack.message]);
    setDialogStepIdx(0);
    currentDialogType.current = 'welcomeBack';
    welcomeBackAutoCloseMsRef.current = welcomeBack.autoCloseMs ?? DEFAULT_WELCOME_BACK_AUTO_CLOSE_MS;
    tryActivateDialog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [welcomeBack?.status, welcomeBack?.message, welcomeBack?.autoCloseMs]);

  // Cross-tab dismissal sync: if the SAME candidate (same appId/userId/
  // dedupeKey, new OR legacy key format) is dismissed in another
  // same-origin tab, close locally WITHOUT re-writing localStorage —
  // never invokes the CTA.
  useEffect(() => {
    if (disabled || !userId) return;
    const handler = (event: StorageEvent) => {
      if (!event.key || event.newValue === null) return;
      if (currentDialogType.current !== 'personalized') return;
      if (!isDialogActiveRef.current) return;
      const candidate = activeCandidateRef.current;
      if (!candidate) return;
      if (matchesDismissalKey(event.key, appId, userId, candidate.dedupeKey)) {
        closeDialog({ persistDismissal: false });
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, userId, appId]);

  const dialogue: CatDialoguePresentation =
    isDialogActive && !activeCandidate && dialogSteps.length > 0
      ? {
          kind: 'sequence',
          steps: dialogSteps,
          stepIndex: dialogStepIdx,
          onBack: () => setDialogStepIdx((p) => Math.max(0, p - 1)),
          onNext: () => setDialogStepIdx((p) => Math.min(dialogSteps.length - 1, p + 1)),
          onClose: () => closeDialog(),
        }
      : isDialogActive && activeCandidate
        ? {
            kind: 'personalized',
            message: activeCandidate.message,
            action: activeCandidate.action
              ? {
                  label: activeCandidate.action.label,
                  onClick: () => {
                    // Exact adopted candidate/action binding: both refs
                    // read BEFORE closeDialog() clears them — never a
                    // fresh/live re-resolution at click time.
                    const onAction = activeOnActionRef.current;
                    const candidateToActOn = activeCandidateRef.current;
                    closeDialog();
                    if (candidateToActOn) void onAction?.(candidateToActOn);
                  },
                }
              : undefined,
            onClose: () => closeDialog(),
          }
        : { kind: 'none' };

  return { dialogue, closeActiveDialogue: () => closeDialog() };
}
