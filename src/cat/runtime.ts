'use client';

import { useEffect, useRef, useState } from 'react';
import type { DialogueCandidate } from '../contracts';
import type { CatDialoguePresentation } from './presentation';
import type { DialogueRuntimeInput, DialogueRuntimeResult } from './dialogueRuntime.types';
import { CAT_ENTRY_WALK_DURATION_MS, DEFAULT_WELCOME_BACK_AUTO_CLOSE_MS } from './internal/timing';
import { isIntroCompleted, markIntroCompleted } from './internal/introCompletion';

type DialogType = 'intro' | 'welcomeBack' | 'personalized' | null;

/**
 * Shared Cat dialogue lifecycle engine.
 *
 * Hosts provide an ordered pool of already-resolved candidates. Close/CTA
 * advances to the next candidate in this mount, then Welcome Back. The
 * completed round is never persisted, so the next visit starts again.
 *
 * Business logic that stays entirely host-side (never appears here):
 * candidate generation, candidate ordering/eligibility, Intro/Welcome Back
 * content fetching, profile/name
 * resolution, routing, and any Supabase/AIBoard read.
 */
export function useSharedCatDialogueRuntime<
  TCandidate extends DialogueCandidate = DialogueCandidate
>(input: DialogueRuntimeInput<TCandidate>): DialogueRuntimeResult {
  const { userId, disabled = false, intro, personalized, welcomeBack } = input;

  const [dialogSteps, setDialogSteps] = useState<string[]>([]);
  const [dialogStepIdx, setDialogStepIdx] = useState(0);
  const [isDialogActive, setIsDialogActive] = useState(false);
  const [activeCandidate, setActiveCandidate] = useState<TCandidate | null>(null);

  const currentDialogType = useRef<DialogType>(null);
  // A completed walkthrough is scoped to this mount. Reloading starts a
  // fresh round, including candidates closed in earlier visits.
  const shownCandidateKeysRef = useRef<Set<string>>(new Set());
  const activeCandidateRef = useRef<TCandidate | null>(null);
  // Captured at adoption time, never re-read live at CTA-click time — see
  // the CTA handler in `dialogue` below.
  const activeOnActionRef = useRef<((candidate: TCandidate) => void | Promise<void>) | null>(null);
  const [advanceTick, setAdvanceTick] = useState(0);
  const isDialogActiveRef = useRef(false);
  const isEntryWalkComplete = useRef(false);
  const [welcomeBackPhaseEntered, setWelcomeBackPhaseEntered] = useState(false);
  const roundCompleteRef = useRef(false);
  const lastUserIdRef = useRef(userId);
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

  const closeDialog = () => {
    const dialogType = currentDialogType.current;
    if (!dialogType) return;
    isDialogActiveRef.current = false;
    setIsDialogActive(false);
    if (dialogType === 'personalized') {
      activeCandidateRef.current = null;
      activeOnActionRef.current = null;
      setActiveCandidate(null);
    }
    clearWelcomeBackAutoCloseTimer();
    if (dialogType === 'intro' && !disabled && userId) markIntroCompleted(userId);
    currentDialogType.current = null;
    if (dialogType === 'welcomeBack') roundCompleteRef.current = true;
    else setAdvanceTick((value) => value + 1);
  };

  // Single source of truth for showing a prepared dialog: only activates
  // once the entry walk has finished AND a dialog type has been prepared
  // AND that specific type hasn't already been dismissed this activation.
  // Idempotent via isDialogActiveRef.
  const tryActivateDialog = () => {
    const dialogType = currentDialogType.current;
    if (!isEntryWalkComplete.current || !dialogType || isDialogActiveRef.current) {
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

  useEffect(() => {
    if (lastUserIdRef.current === userId) return;
    lastUserIdRef.current = userId;
    clearWelcomeBackAutoCloseTimer();
    currentDialogType.current = null;
    activeCandidateRef.current = null;
    shownCandidateKeysRef.current.clear();
    roundCompleteRef.current = false;
    isDialogActiveRef.current = false;
    setIsDialogActive(false);
    setActiveCandidate(null);
    setWelcomeBackPhaseEntered(false);
    setAdvanceTick((value) => value + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

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

  // Intro is a one-time onboarding step. Closing it advances to this visit's
  // personalized round; later visits skip Intro but repeat the round.
  useEffect(() => {
    if (currentDialogType.current || isIntroCompleted(userId ?? '')) return;
    if (!disabled && userId && isIntroCompleted(userId)) {
      return; // returning-user phase — handled by the arbitration effect
    }
    if (!intro) return; // host has no Intro concept — wait forever
    if (intro.status !== 'ready') return;
    const steps = intro.steps ?? [];
    if (steps.length > 0) {
      setDialogSteps(steps);
      setDialogStepIdx(0);
      currentDialogType.current = 'intro';
      tryActivateDialog();
    } else if (!disabled && userId) {
      markIntroCompleted(userId);
      setAdvanceTick((value) => value + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, userId, intro?.status, intro?.steps]);

  // Re-scan the ordered pool after every Close/CTA. An unresolved adapter
  // must not be mistaken for an empty pool.
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
    if (roundCompleteRef.current) return;
    if (currentDialogType.current) return;
    if (!isIntroCompleted(userId)) return;

    if (personalized == null) {
      setWelcomeBackPhaseEntered(true);
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
    // first candidate not shown this mount. Never
    // re-sorted, never interpreted beyond dedupeKey.
    const candidates = personalizedState.candidates ?? [];
    const eligible = candidates.find(
      (c) => c.dedupeKey && !shownCandidateKeysRef.current.has(c.dedupeKey)
    );

    if (eligible) {
      setWelcomeBackPhaseEntered(false);
      activeCandidateRef.current = eligible;
      shownCandidateKeysRef.current.add(eligible.dedupeKey);
      activeOnActionRef.current = personalized?.onAction ?? null;
      setActiveCandidate(eligible);
      currentDialogType.current = 'personalized';
      tryActivateDialog();
      return;
    }

    setWelcomeBackPhaseEntered(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalized?.state, userId, disabled, advanceTick]);

  // Welcome Back content: only acts once the arbitration effect above has
  // entered the Welcome Back phase, and only once the host's reactive
  // `welcomeBack` input reports `'ready'`.
  useEffect(() => {
    if (!welcomeBackPhaseEntered) return;
    if (roundCompleteRef.current) return;
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
  }, [welcomeBack?.status, welcomeBack?.message, welcomeBack?.autoCloseMs, welcomeBackPhaseEntered]);

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
