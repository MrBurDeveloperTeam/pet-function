'use client';

import { useEffect, useRef, useState } from 'react';
import type { DialogueCandidate } from '../contracts';
import type { CatDialoguePresentation } from './presentation';
import type { DialogueRuntimeInput, DialogueRuntimeResult } from './dialogueRuntime.types';
import { CAT_ENTRY_WALK_DURATION_MS, DEFAULT_WELCOME_BACK_AUTO_CLOSE_MS } from './internal/timing';
import { isIntroCompleted, markIntroCompleted } from './internal/introCompletion';
import { holdDialogueUntilReload, isDialogueHeldUntilReload, markDialogueClosedForRefresh, readClosedDialogueKeys, resetDialogueProgress } from './internal/refreshDialogueProgress';
import { emitSnabbbDiagnostic } from '../observability';

type DialogType = 'intro' | 'welcomeBack' | 'personalized' | null;

function candidateDiagnostic(candidate: DialogueCandidate | null, appId: string) {
  if (!candidate) return { dialogueId: `${appId}:unknown` };
  const extended = candidate as DialogueCandidate & { dialogueId?: string; ruleVersion?: string; evaluatedAt?: string };
  return {
    dialogueId: extended.dialogueId || `${appId}:${candidate.triggerId}`,
    triggerId: candidate.triggerId,
    ruleVersion: extended.ruleVersion,
    evaluatedAt: extended.evaluatedAt,
  };
}

/**
 * Shared Cat dialogue lifecycle engine.
 *
 * Hosts provide an ordered pool of already-resolved candidates. Close/CTA
 * ends this page's display. The next reload re-evaluates the pool and skips
 * reminders closed in this tab until Welcome Back ends the round.
 *
 * Business logic that stays entirely host-side (never appears here):
 * candidate generation, candidate ordering/eligibility, Intro/Welcome Back
 * content fetching, profile/name
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
      closeDialog('auto_close');
    }, duration);
  };

  const closeDialog = (reasonCode = 'close') => {
    const dialogType = currentDialogType.current;
    if (!dialogType) return;
    emitSnabbbDiagnostic({
      eventType: 'pet_dialogue_closed',
      appId,
      dialogType,
      reasonCode,
      ...(dialogType === 'personalized'
        ? candidateDiagnostic(activeCandidateRef.current, appId)
        : { dialogueId: `${appId}:${dialogType}` }),
    });
    if (userId) holdDialogueUntilReload(appId, userId);
    if (dialogType === 'personalized' && userId && activeCandidateRef.current) {
      markDialogueClosedForRefresh(appId, userId, activeCandidateRef.current.dedupeKey);
    }
    if (dialogType === 'welcomeBack' && userId) resetDialogueProgress(appId, userId);
    roundCompleteRef.current = true;
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
    emitSnabbbDiagnostic({
      eventType: 'pet_dialogue_shown',
      appId,
      dialogType,
      ...(dialogType === 'personalized'
        ? candidateDiagnostic(activeCandidateRef.current, appId)
        : { dialogueId: `${appId}:${dialogType}` }),
    });
    if (dialogType === 'welcomeBack') {
      startWelcomeBackAutoCloseTimer();
    }
  };

  useEffect(() => {
    if (lastUserIdRef.current === userId) return;
    lastUserIdRef.current = userId;
    clearWelcomeBackAutoCloseTimer();
    currentDialogType.current = null;
    activeCandidateRef.current = null;
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

  // Intro is a one-time onboarding step. Closing it leaves this page quiet;
  // the first personalized reminder can appear after the next reload.
  useEffect(() => {
    if (currentDialogType.current || isIntroCompleted(userId ?? '')) return;
    if (!disabled && userId && isIntroCompleted(userId)) {
      return; // returning-user phase — handled by the arbitration effect
    }
    if (!intro) return; // host has no Intro concept — wait forever
    if (intro.status !== 'ready') return;
    const steps = intro.steps ?? [];
    emitSnabbbDiagnostic({ eventType: 'pet_dialogue_evaluated', appId, dialogType: 'intro', candidateCount: steps.length > 0 ? 1 : 0, eligibleCount: steps.length > 0 ? 1 : 0, reasonCode: steps.length > 0 ? 'intro_ready' : 'intro_empty' });
    if (steps.length > 0) {
      setDialogSteps(steps);
      setDialogStepIdx(0);
      currentDialogType.current = 'intro';
      emitSnabbbDiagnostic({ eventType: 'pet_dialogue_selected', appId, dialogType: 'intro', dialogueId: `${appId}:intro` });
      tryActivateDialog();
    } else if (!disabled && userId) {
      markIntroCompleted(userId);
      setAdvanceTick((value) => value + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, userId, intro?.status, intro?.steps]);

  // Select once per page load. An unresolved adapter
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
    if (isDialogueHeldUntilReload(appId, userId)) return;
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
    // first candidate not closed on an earlier load. Never
    // re-sorted, never interpreted beyond dedupeKey.
    const candidates = personalizedState.candidates ?? [];
    const closedKeys = readClosedDialogueKeys(appId, userId);
    const eligibleCandidates = candidates.filter((c) => c.dedupeKey && !closedKeys.has(c.dedupeKey));
    emitSnabbbDiagnostic({
      eventType: 'pet_dialogue_evaluated',
      appId,
      dialogType: 'personalized',
      candidateCount: candidates.length,
      eligibleCount: eligibleCandidates.length,
      reasonCode: eligibleCandidates.length > 0 ? 'eligible_candidate' : 'no_eligible_candidate',
    });
    const eligible = eligibleCandidates[0];

    if (eligible) {
      setWelcomeBackPhaseEntered(false);
      activeCandidateRef.current = eligible;
      activeOnActionRef.current = personalized?.onAction ?? null;
      setActiveCandidate(eligible);
      currentDialogType.current = 'personalized';
      emitSnabbbDiagnostic({
        eventType: 'pet_dialogue_selected',
        appId,
        dialogType: 'personalized',
        ...candidateDiagnostic(eligible, appId),
      });
      tryActivateDialog();
      return;
    }

    setWelcomeBackPhaseEntered(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalized?.state, userId, disabled, advanceTick, appId]);

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
    emitSnabbbDiagnostic({ eventType: 'pet_dialogue_evaluated', appId, dialogType: 'welcomeBack', candidateCount: 1, eligibleCount: 1, reasonCode: 'welcome_back_ready' });
    setDialogSteps([welcomeBack.message]);
    setDialogStepIdx(0);
    currentDialogType.current = 'welcomeBack';
    emitSnabbbDiagnostic({ eventType: 'pet_dialogue_selected', appId, dialogType: 'welcomeBack', dialogueId: `${appId}:welcomeBack` });
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
          onClose: () => closeDialog('close'),
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
                    if (candidateToActOn) {
                      emitSnabbbDiagnostic({
                        eventType: 'pet_dialogue_action_clicked',
                        appId,
                        dialogType: 'personalized',
                        actionType: candidateToActOn.action?.actionId || 'cta',
                        ...candidateDiagnostic(candidateToActOn, appId),
                      });
                    }
                    closeDialog('action_clicked');
                    if (candidateToActOn) void onAction?.(candidateToActOn);
                  },
                }
              : undefined,
            onClose: () => closeDialog('close'),
          }
        : { kind: 'none' };

  return { dialogue, closeActiveDialogue: () => closeDialog('cat_click') };
}
