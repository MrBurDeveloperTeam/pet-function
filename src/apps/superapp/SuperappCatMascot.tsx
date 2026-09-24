import { useEffect, useMemo, useRef, useState } from 'react';
import { SharedCatMascot, useSharedCatSleepSync, readSharedPetName, writeSharedPetName, getSharedPetNameStorageKey, resolveCatAuthStatus } from '../../cat';
import type { CatDialoguePresentation, CatAuthStatus } from '../../cat';
import { normalizePetId } from '../../pet/publicOptions';
import { CAT_SPRITE_SHEET_URLS } from '../../resources';
import { getSuperappHostDependencies } from './dependencies';
import { isPersonalizedPetDialogueEnabled } from './petDialogue/dialogueFlag';
import { usePersonalizedPetDialogue } from './petDialogue/usePersonalizedPetDialogue';
import { markDialogueDismissed, resetDialogueRound } from './petDialogue/sessionDedupe';
import { holdDialogueUntilReload, isDialogueHeldUntilReload } from '../../cat/internal/refreshDialogueProgress';
import { DIALOGUE_ID, type DialogueCandidate, type ProfileCompletionStatus } from './petDialogue/types';
import { emitSnabbbDiagnostic } from '../../observability';

// PHASE 9D (Cat Presentation migration): the local App Gallery dialogue
// resolver/arbitration below is UNCHANGED — every effect, ref, and storage
// call in this file is a byte-identical carry-over from the pre-9D source.
// Only the generic sprite/movement/bubble PRESENTATION is now delegated to
// `SharedCatMascot` (confirmed byte-identical entry-walk/click-to-move
// formulas via `dist/cat.js`). The local dialogue state
// (dialogSteps/dialogStep/isDialogActive/personalizedActiveCandidate) is
// transformed into the published `CatDialoguePresentation` shape purely for
// rendering — see `dialoguePresentation` below — never fed into
// `useSharedCatDialogueRuntime`, which this app does NOT adopt (see the
// Phase 9A audit's documented Dialogue semantic gap: sessionStorage
// shown-at-display/F5 behavior, logout dismissal cleanup, and the flat
// P0/P1/PROFILE/P2/LEGACY_INTRO/FALLBACK priority model — where urgent
// candidates can preempt Intro — are all incompatible with the shared
// runtime's hard-gated 3-slot design).
const PET_SLEEPING_KEY = 'pet_is_sleeping';
const PET_SLEEPING_UPDATED_AT_KEY = 'pet_is_sleeping_updated_at';
const DEFAULT_WELCOME_BACK_AUTO_CLOSE_MS = 6000;

// PHASE APPGALLERY-HOST-1: this Cat presentation cache (pet mood/sleep
// stats used for the ambient meow bubble/sleep icon) is host-owned and
// account-sensitive, so it must never bleed across accounts on a shared
// browser profile. Own namespace — `snabbb_cat:<userId>:<key>` —
// deliberately distinct from Shared's own `snabbb_pet:<userId>:<key>` (no
// shared contract for reusing that one). `userId` absent -> no-op/null:
// presentation optimization only, never a guest-mode persistent store.
const CAT_CACHE_PREFIX = 'snabbb_cat';
const getCatStorageKey = (userId: string | null, key: string) => (userId ? `${CAT_CACHE_PREFIX}:${userId}:${key}` : null);
const readCatStorage = (userId: string | null, key: string): string | null => {
  const storageKey = getCatStorageKey(userId, key);
  if (!storageKey) return null;
  try { return localStorage.getItem(storageKey); } catch { return null; }
};
const writeCatStorage = (userId: string | null, key: string, value: string) => {
  const storageKey = getCatStorageKey(userId, key);
  if (!storageKey) return;
  try { localStorage.setItem(storageKey, value); } catch { /* ignore */ }
};

interface CatMascotProps {
  onCatClick?: () => void;
  disabled?: boolean;
  isHidden?: boolean;
  /** Odoo-derived profile-completeness signal, resolved by the caller (see App.tsx). Only read when the personalized-dialogue feature flag is enabled. */
  profileCompletionStatus?: ProfileCompletionStatus;
  /**
   * The Supabase Auth user id App.tsx has confirmed (via
   * reconcileSupabaseIdentity) belongs to the same account as the currently
   * Odoo-verified user. Three states: `undefined` = reconciliation still in
   * progress / not yet attempted (stay neutral, don't guess); `null` =
   * confirmed guest, or a failed/mismatched reconciliation; a string = the
   * confirmed-matched Supabase user id. This is the sole authority
   * usePersonalizedPetDialogue uses for "which identity, if any,
   * personalized providers may run against" — CatMascot never independently
   * re-derives or double-guesses identity matching.
   */
  personalizedMatchedUserId?: string | null;
  // (component-level default below narrows the "not passed at all" case to
  // `undefined`, i.e. treated the same as "still reconciling" — never
  // defaults to the stronger claim "confirmed guest".)
  /**
   * App Gallery's proven canonical Pet/Cat owner id — `personalizedMatchedUserId`
   * with its `undefined` ("still reconciling") state already collapsed to
   * `null` by the caller (see App.tsx's `petCatOwnerId`). Used ONLY for
   * this component's own account-scoped presentation cache (mood/sleep
   * stats); the personalized-dialogue system above continues to use the
   * raw `personalizedMatchedUserId` tri-state directly, unchanged.
   */
  catCacheOwnerId?: string | null;
  authStatus?: CatAuthStatus;
  /** Internal (pushState-based) navigation, used by the profile-reminder action button. Only used when the feature flag is enabled. */
  onNavigateInternal?: (path: string) => void;
}

export default function CatMascot({
  onCatClick,
  disabled = false,
  isHidden = false,
  profileCompletionStatus = 'unknown',
  personalizedMatchedUserId,
  catCacheOwnerId = null,
  authStatus,
  onNavigateInternal,
}: CatMascotProps) {
  const { supabase } = getSuperappHostDependencies();
  const [isPetSleeping, setIsPetSleeping] = useState(() => readCatStorage(catCacheOwnerId, PET_SLEEPING_KEY) === 'true');
  const handleCatBedSleepChange = useSharedCatSleepSync(supabase, catCacheOwnerId, setIsPetSleeping);
  const resolvedAuthStatus = resolveCatAuthStatus(authStatus, disabled, catCacheOwnerId);
  const initialPetName = readSharedPetName(catCacheOwnerId);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(() => resolvedAuthStatus === 'guest' || initialPetName ? normalizePetId(initialPetName) : null);
  const [isPetIdentityReady, setIsPetIdentityReady] = useState(() => resolvedAuthStatus === 'guest' || Boolean(initialPetName));

  const [dialogStep, setDialogStep] = useState(0);
  const [isDialogActive, setIsDialogActive] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const autoCloseTimerRef = useRef<any>(null);
  // Driven exclusively by SharedCatMascot's `onEntryWalkComplete` callback
  // (see the prop wired below) — the true signal that the Cat's entry walk
  // has reached its final resting position, not a host-side approximation.
  // Never set true anywhere else (see tryActivateDialog for the gate this
  // guards).
  const isEntryWalkComplete = useRef(false);
  // Current step of this page load. Close leaves the page quiet; the next
  // reload re-evaluates candidates after the ones closed in this tab.
  const currentDialogType = useRef<'intro' | 'welcomeBack' | 'personalized' | null>(null);
  const roundCompleteRef = useRef(false);
  // Holds the winning Phase 1A candidate while it's active, so tryActivateDialog
  // can decide whether to bypass the entry-walk gate / arm an auto-close timer,
  // and so the bubble can render its optional action button. Mirrored into
  // React state (personalizedActiveCandidate below) for render-time reads,
  // following the same ref+state split already used for isDialogActive.
  const personalizedCandidateRef = useRef<DialogueCandidate | null>(null);
  const [personalizedActiveCandidate, setPersonalizedActiveCandidate] = useState<DialogueCandidate | null>(null);
  // Holds the auto-close duration for a prepared 'welcomeBack' dialog, set when
  // its content is fetched but only ever consumed by tryActivateDialog() at the
  // moment it actually shows — see the comment on tryActivateDialog for why.
  const welcomeBackAutoCloseMsRef = useRef(DEFAULT_WELCOME_BACK_AUTO_CLOSE_MS);
  // Mirrors isDialogActive synchronously (React state updates aren't immediate).
  // Without this, tryActivateDialog() can be called again while a dialog is
  // already showing (e.g. StrictMode's dev double-invoke of the fetch effect,
  // or the click-to-move handler firing again) and would re-arm the Welcome
  // Back timer from scratch every time, so it could keep getting reset before
  // ever completing a full countdown.
  const isDialogActiveRef = useRef(false);

  const clearWelcomeBackAutoCloseTimer = () => {
    if (autoCloseTimerRef.current !== null) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  };

  // durationOverrideMs lets the Phase 1A fixed welcome fallback reuse this
  // same timer instead of duplicating it; the legacy 'welcomeBack' call site
  // below passes no override and keeps its existing DB-configured duration.
  const startWelcomeBackAutoCloseTimer = (durationOverrideMs?: number) => {
    clearWelcomeBackAutoCloseTimer();

    const configuredDuration = Number(durationOverrideMs ?? welcomeBackAutoCloseMsRef.current);
    const duration = Number.isFinite(configuredDuration) && configuredDuration > 0
      ? configuredDuration
      : DEFAULT_WELCOME_BACK_AUTO_CLOSE_MS;

    autoCloseTimerRef.current = setTimeout(() => {
      autoCloseTimerRef.current = null;
      closeDialog('auto_close');
    }, duration);
  };

  // Marks the Post-Login Intro stage complete for a given user — either because
  // they actually dismissed a visible Intro, or because a successful query
  // confirmed there's no Intro configured/usable to show. Takes an explicit
  // userId (rather than reading currentUserId state) so it's safe to call from
  // inside initDialog() itself, where the just-fetched userId may not yet be
  // reflected in currentUserId (state updates aren't synchronous).
  const markIntroCompleted = (uid: string | null) => {
    if (!uid) return;
    localStorage.setItem(`intro_shown_${uid}`, 'true');
  };

  // Every Close leaves this page quiet. Welcome Back also resets progress,
  // so the following reload starts at the first still-eligible reminder.
  const closeDialog = (reasonCode = 'close') => {
    const dialogType = currentDialogType.current;
    if (!dialogType) return;
    const candidate = personalizedCandidateRef.current;
    emitSnabbbDiagnostic({
      eventType: 'pet_dialogue_closed',
      appId: 'superapp',
      dialogType,
      reasonCode,
      dialogueId: candidate?.dialogueId || `superapp:${dialogType}`,
      triggerId: candidate?.triggerId,
      ruleVersion: candidate?.ruleVersion,
      evaluatedAt: candidate?.evaluatedAt,
    });
    if (personalizedUserId) holdDialogueUntilReload('superapp', personalizedUserId);
    if (dialogType === 'personalized') {
      const candidate = personalizedCandidateRef.current;
      if (candidate && personalizedUserId) {
        if (candidate.dialogueId === DIALOGUE_ID.WELCOME_FALLBACK) resetDialogueRound(personalizedUserId);
        else markDialogueDismissed(personalizedUserId, candidate.dedupeKey);
      }
    }
    if (dialogType === 'welcomeBack' && personalizedUserId) resetDialogueRound(personalizedUserId);
    roundCompleteRef.current = true;
    isDialogActiveRef.current = false;
    setIsDialogActive(false);
    clearWelcomeBackAutoCloseTimer();
    if (dialogType === 'intro' && !disabled && currentUserId) {
      markIntroCompleted(currentUserId);
    }
    currentDialogType.current = null;
    personalizedCandidateRef.current = null;
    setPersonalizedActiveCandidate(null);
    setDialogSteps([]);
  };

  // Single source of truth for showing a prepared dialog: only activates once the
  // entry walk has finished AND a dialog type has been prepared. Idempotent via
  // isDialogActiveRef — once active, further calls (StrictMode's dev double-invoke
  // of the fetch effect, click-to-move, etc.) are no-ops instead of re-arming the
  // Welcome Back timer from scratch every time.
  //
  // Entry-walk position/timing is owned entirely by SharedCatMascot (see the
  // Phase 9D migration note at the top of this file); `isEntryWalkComplete`
  // is driven exclusively by its `onEntryWalkComplete` callback (wired on the
  // <SharedCatMascot> element below), which is the true completion signal —
  // never a host-side timer/approximation. Calling this again once that
  // callback fires (see the callback itself) is what lets a candidate that
  // was already selected/adopted mid-walk still activate the instant the Cat
  // arrives, without duplicating any of the logic below.
  const tryActivateDialog = () => {
    const dialogType = currentDialogType.current;
    if (!dialogType || isDialogActiveRef.current) {
      return;
    }

    if (!isEntryWalkComplete.current) {
      return;
    }

    // Phase 1A candidates must never activate while the mascot wrapper is
    // intentionally hidden (auth routes, or the
    // Virtual Pet modal — see App.tsx's `isHidden` prop). The legacy Intro /
    // Welcome Back path never gated on this, so this check is scoped to
    // 'personalized' only to leave that behaviour unchanged when the feature
    // flag is disabled. See the effect below that retries once unhidden.
    if (dialogType === 'personalized' && isHiddenRef.current) {
      return;
    }

    isDialogActiveRef.current = true;
    setIsDialogActive(true);
    const candidate = personalizedCandidateRef.current;
    emitSnabbbDiagnostic({
      eventType: 'pet_dialogue_shown',
      appId: 'superapp',
      dialogType,
      dialogueId: candidate?.dialogueId || `superapp:${dialogType}`,
      triggerId: candidate?.triggerId,
      ruleVersion: candidate?.ruleVersion,
      evaluatedAt: candidate?.evaluatedAt,
    });

    if (dialogType === 'welcomeBack') {
      startWelcomeBackAutoCloseTimer();
    } else if (dialogType === 'personalized') {
      const candidate = personalizedCandidateRef.current;
      if (candidate) {
        if (candidate.autoCloseMs) startWelcomeBackAutoCloseTimer(candidate.autoCloseMs);
      }
    }
  };

  const [dialogSteps, setDialogSteps] = useState<string[]>([]);

  // ─── Phase 1A personalized dialogue resolver (feature-flagged) ─────────────
  // Computed once per render; the env var is effectively constant for the
  // lifetime of a build, so this behaves like a compile-time switch between
  // the legacy code path below and the new resolver-driven one.
  const personalizedDialogueEnabled = isPersonalizedPetDialogueEnabled();
  const {
    lifecycle: personalizedLifecycle,
    selection: personalizedSelection,
    userId: personalizedUserId,
    runAction: runPersonalizedAction,
  } = usePersonalizedPetDialogue({
    active: personalizedDialogueEnabled && !disabled,
    matchedUserId: personalizedMatchedUserId,
    profileStatus: profileCompletionStatus,
    introAlreadyCompleted: (uid: string) => {
      try {
        return localStorage.getItem(`intro_shown_${uid}`) === 'true';
      } catch {
        return false;
      }
    },
    onNavigateInternal,
  });

  // usePersonalizedPetDialogue reactively tracks the authenticated identity
  // and restarts its own evaluation the instant it changes — including a
  // cross-tab account switch that doesn't otherwise flip `disabled` (which
  // only reflects logged-in/guest, not *which* user). But the adoption
  // effect below deliberately "locks" after its first adoption
  // (currentDialogType.current already set) so a later same-user resolver
  // re-run can never replace an already-shown dialogue. Without this reset,
  // that same lock would also — wrongly — keep a previous user's
  // already-adopted/pending dialogue on screen (or pending while hidden)
  // even after the hook has moved on to a fresh, current-user-only
  // evaluation for someone else. This effect exists solely to detect that
  // one case and clear it first.
  const lastPersonalizedUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!personalizedDialogueEnabled || disabled) return;
    if (!personalizedUserId) return;

    const previousUserId = lastPersonalizedUserIdRef.current;
    lastPersonalizedUserIdRef.current = personalizedUserId;

    if (!previousUserId || previousUserId === personalizedUserId) return;
    roundCompleteRef.current = false;

    // Identity changed under this mount. Only ever tears down state this
    // same resolver adopted ('personalized' or resolver-driven 'intro') —
    // never the unrelated legacy 'welcomeBack' path.
    if (currentDialogType.current === 'personalized' || currentDialogType.current === 'intro') {
      currentDialogType.current = null;
      personalizedCandidateRef.current = null;
      setPersonalizedActiveCandidate(null);
      isDialogActiveRef.current = false;
      setIsDialogActive(false);
      clearWelcomeBackAutoCloseTimer();
      setDialogSteps([]);
      setDialogStep(0);
      // The outgoing user's current step must not survive an account switch.
    }
  }, [personalizedUserId, personalizedDialogueEnabled, disabled]);

  // Adopts the resolver's selection into the same dialogSteps/currentDialogType
  // machinery the legacy Intro/Welcome Back paths already use, so rendering,
  // dismissal, and the entry-walk gate stay a single code path. Locks after
  // the first adoption (currentDialogType.current already set) so a later
  // resolver re-run — e.g. profileStatus settling from 'loading' — can never
  // replace an already-shown dialogue for this mount.
  useEffect(() => {
    if (!personalizedDialogueEnabled || disabled) return;
    if (personalizedUserId && isDialogueHeldUntilReload('superapp', personalizedUserId)) return;
    if (roundCompleteRef.current) return;
    if (personalizedLifecycle !== 'ready' && personalizedLifecycle !== 'failed') return;
    if (!personalizedSelection) return;
    if (currentDialogType.current) return;

    if (personalizedUserId) setCurrentUserId(personalizedUserId);

    const { candidate, introSteps } = personalizedSelection;
    emitSnabbbDiagnostic({
      eventType: 'pet_dialogue_evaluated',
      appId: 'superapp',
      dialogType: 'personalized',
      candidateCount: 1,
      eligibleCount: 1,
      reasonCode: personalizedLifecycle === 'failed' ? 'fallback_selected' : 'eligible_candidate',
    });
    personalizedCandidateRef.current = candidate;
    setPersonalizedActiveCandidate(candidate);

    if (candidate.dialogueId === DIALOGUE_ID.LEGACY_POST_LOGIN_INTRO && introSteps.length > 0) {
      // Reuse the existing multi-step Intro rendering/dismissal exactly as-is.
      setDialogSteps(introSteps);
      setDialogStep(0);
      currentDialogType.current = 'intro';
    } else {
      setDialogSteps([candidate.message]);
      setDialogStep(0);
      currentDialogType.current = 'personalized';
    }

    emitSnabbbDiagnostic({
      eventType: 'pet_dialogue_selected',
      appId: 'superapp',
      dialogType: currentDialogType.current || 'personalized',
      dialogueId: candidate.dialogueId,
      triggerId: candidate.triggerId,
      ruleVersion: candidate.ruleVersion,
      evaluatedAt: candidate.evaluatedAt,
    });

    tryActivateDialog();
  }, [personalizedDialogueEnabled, disabled, personalizedLifecycle, personalizedSelection, personalizedUserId]);

  // A personalized candidate may have been ready while the mascot wrapper was
  // hidden (isHiddenRef gate in tryActivateDialog above) — retry activation
  // once it's visible again. Scoped to the flag being enabled so this is a
  // guaranteed no-op, and therefore behaviour-preserving, when it's disabled.
  //
  // This effect is declared before the isHiddenRef sync effect below, so on
  // the same render where `isHidden` flips to false, this one would
  // otherwise run first and call tryActivateDialog() while isHiddenRef.current
  // is still stale (true) — silently defeating the retry. Updating the ref
  // synchronously here, right before the call, removes the dependency on
  // effect declaration order.
  useEffect(() => {
    if (!personalizedDialogueEnabled || isHidden) return;
    isHiddenRef.current = isHidden;
    tryActivateDialog();
  }, [personalizedDialogueEnabled, isHidden]);

  const [meowMsg, setMeowMsg] = useState<string | null>(null);
  const [petStates, setPetStates] = useState(['Normal']);

  // ─── Refs used inside loops to avoid stale closures / dep-array restarts ───
  const meowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meowInnerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // FIX: track inner timer too
  const isHiddenRef = useRef(isHidden);
  // Named distinctly from the manually-managed `isDialogActiveRef` lock above
  // (pre-existing duplicate-declaration bug fixed while wiring Phase 1A —
  // see implementation report): this one just mirrors `isDialogActive`
  // state for the meow loop below so it doesn't need to restart on change.
  const isDialogActiveMeowRef = useRef(isDialogActive); // FIX: ref so loop doesn't restart on dialog change
  const petStatesRef = useRef(['Normal']);           // FIX: ref so loop doesn't restart on state change

  useEffect(() => { isHiddenRef.current = isHidden; }, [isHidden]);
  useEffect(() => { isDialogActiveMeowRef.current = isDialogActive; }, [isDialogActive]);

  // PHASE 9D: replicates the old local `handleGlobalClick`'s
  // `if (isHiddenRef.current) return;` click-to-move suppression, using
  // `SharedCatMascot`'s own documented `document.body` convention (confirmed
  // via `dist/cat.js`: its internal click handler already checks
  // `document.body.classList.contains('pet-assistant-hidden')` before
  // moving) — no second click listener is introduced.
  useEffect(() => {
    if (isHidden) {
      document.body.classList.add('pet-assistant-hidden');
    } else {
      document.body.classList.remove('pet-assistant-hidden');
    }
    return () => { document.body.classList.remove('pet-assistant-hidden'); };
  }, [isHidden]);

  // Clear message bubble immediately when pet state changes
  useEffect(() => {
    setMeowMsg(null);
    petStatesRef.current = petStates; // keep ref in sync
  }, [petStates]);

  // ─── Pet stats polling ────────────────────────────────────────────────────
  useEffect(() => {
    if (disabled) return;

    const computeStates = (stats: any, prevStates: string[]) => {
      const HUNGRY_ENTER = 30, HUNGRY_EXIT = 35;
      const DIRTY_ENTER = 30,  DIRTY_EXIT = 35;
      const ENERGY_ENTER = 30, ENERGY_EXIT = 35;
      const HAPPY_ENTER = 40,  HAPPY_EXIT = 45;

      const active = [];
      if (stats.hunger   < HUNGRY_ENTER || (prevStates.includes('Hungry')     && stats.hunger   < HUNGRY_EXIT)) active.push('Hungry');
      if (stats.hygiene  < DIRTY_ENTER  || (prevStates.includes('Dirty')      && stats.hygiene  < DIRTY_EXIT))  active.push('Dirty');
      if (stats.energy   < ENERGY_ENTER || (prevStates.includes('Low Energy') && stats.energy   < ENERGY_EXIT)) active.push('Low Energy');
      if (stats.happiness< HAPPY_ENTER  || (prevStates.includes('Unhappy')    && stats.happiness< HAPPY_EXIT))  active.push('Unhappy');

      if (active.length === 0) active.push('Normal');
      return active;
    };

    const updateStateFromStats = (stats: any, updatedAt: string | null) => {
      if (!stats) return;

      let finalStats = { ...stats };

      if (updatedAt) {
        const elapsedSecs = Math.max(0, (Date.now() - new Date(updatedAt).getTime()) / 1000);
        if (elapsedSecs > 0) {
          finalStats.hunger    = Math.max(0, (stats.hunger    || 0) - 0.01  * elapsedSecs);
          finalStats.energy    = Math.max(0, (stats.energy    || 0) - 0.005 * elapsedSecs);
          finalStats.hygiene   = Math.max(0, (stats.hygiene   || 0) - 0.004 * elapsedSecs);
          finalStats.happiness = Math.max(0, (stats.happiness || 0) - 0.006 * elapsedSecs);
        }
      }

      const newStates = computeStates(finalStats, petStatesRef.current);
      const isDifferent =
        newStates.length !== petStatesRef.current.length ||
        !newStates.every((v, i) => v === petStatesRef.current[i]);

      if (isDifferent) {
        console.log('[CatMascot] States: ' + petStatesRef.current.join(', ') + ' -> ' + newStates.join(', '));
        petStatesRef.current = newStates;
        setPetStates(newStates);
      }
    };

    // Initial check from localStorage (5-min freshness)
    const saved      = readCatStorage(catCacheOwnerId, 'pet_stats');
    const lastSavedAt = readCatStorage(catCacheOwnerId, 'pet_last_saved_at');
    const isFresh    = lastSavedAt && (Date.now() - new Date(lastSavedAt).getTime() < 300000);
    if (saved && isFresh) {
      try { updateStateFromStats(JSON.parse(saved), lastSavedAt); } catch (e) { /* ignore */ }
    }

    const readLocalSleepState = () => {
      const savedSleeping = readCatStorage(catCacheOwnerId, PET_SLEEPING_KEY);
      if (savedSleeping !== null) {
        setIsPetSleeping(savedSleeping === 'true');
      }
    };

    readLocalSleepState();
    const cachedPetName = readSharedPetName(catCacheOwnerId);
    if (resolvedAuthStatus === 'guest') { setSelectedPetId(normalizePetId(null)); setIsPetIdentityReady(true); }
    else if (cachedPetName) { setSelectedPetId(normalizePetId(cachedPetName)); setIsPetIdentityReady(true); }
    else { setSelectedPetId(null); setIsPetIdentityReady(false); }

    const handlePetSleepChange = (event: any) => {
      setIsPetSleeping(!!event.detail);
    };

    const handlePetSelectionChange = (event: any) => {
      setSelectedPetId(normalizePetId(event.detail));
      writeSharedPetName(catCacheOwnerId, event.detail);
      setIsPetIdentityReady(true);
    };

    const handleStorage = (event: StorageEvent) => {
      // Cross-tab sync for THIS owner only — compares against this owner's
      // own scoped keys, not the bare legacy names, so a stray legacy
      // write (or another account's tab) can never trigger it.
      if (event.key === getCatStorageKey(catCacheOwnerId, PET_SLEEPING_KEY)) {
        setIsPetSleeping(event.newValue === 'true');
      }
      if (event.key === getSharedPetNameStorageKey(catCacheOwnerId)) {
        setSelectedPetId(normalizePetId(event.newValue));
      }
    };

    window.addEventListener('virtual-pet-sleep-change', handlePetSleepChange);
    window.addEventListener('virtual-pet-selection-change', handlePetSelectionChange);
    window.addEventListener('storage', handleStorage);

    // 2. Fetch from Supabase for latest data — uses the proven canonical
    // owner id passed down from App.tsx, not an independent session lookup.
    const fetchStats = async () => {
      if (document.visibilityState !== 'visible') return;
      if (!catCacheOwnerId) return;
      try {
        const { data, error } = await supabase
          .from('inventory_pet')
          .select('hunger, hygiene, energy, happiness, is_sleeping, pet_name, updated_at')
          .eq('user_id', catCacheOwnerId)
          .maybeSingle();

        if (data && !error) {
          const nextSleeping = !!data.is_sleeping;
          setIsPetSleeping(nextSleeping);
          writeCatStorage(catCacheOwnerId, PET_SLEEPING_KEY, String(nextSleeping));
          writeCatStorage(catCacheOwnerId, PET_SLEEPING_UPDATED_AT_KEY, data.updated_at || new Date().toISOString());
          setSelectedPetId(normalizePetId(data.pet_name));
          writeSharedPetName(catCacheOwnerId, data.pet_name);
          setIsPetIdentityReady(true);
          updateStateFromStats(data, data.updated_at);
        } else if (!error) {
          setSelectedPetId(normalizePetId(null));
          setIsPetIdentityReady(true);
        }
      } catch (err) {
        console.error('Error fetching pet stats:', err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 120000);
    // Staggered retries: SSO exchange can take 0.5–4s; the first successful call wins
    const r1 = setTimeout(fetchStats, 500);
    const r2 = setTimeout(fetchStats, 2000);
    const r3 = setTimeout(fetchStats, 5000);
    return () => {
      clearInterval(interval);
      clearTimeout(r1); clearTimeout(r2); clearTimeout(r3);
      window.removeEventListener('virtual-pet-sleep-change', handlePetSleepChange);
      window.removeEventListener('virtual-pet-selection-change', handlePetSelectionChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [disabled, catCacheOwnerId, resolvedAuthStatus]);

  // ─── Dialog init (legacy Intro / Welcome Back) ──────────────────────────────
  // When the Phase 1A personalized-dialogue flag is enabled, the effect above
  // owns dialog selection instead — this entire legacy path is left untouched
  // so behaviour with the flag disabled is unaffected.
  useEffect(() => {
    if (personalizedDialogueEnabled) return;

    const initDialog = async () => {
      let userId: string | null = null;
      let userMeta: Record<string, any> | null = null;
      let userEmail: string | null = null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        userId = session?.user?.id || null;
        userMeta = session?.user?.user_metadata || null;
        userEmail = session?.user?.email || null;
        setCurrentUserId(userId);
      } catch (err) {
        console.error("Error fetching session in initDialog:", err);
      }

      if (userId && isDialogueHeldUntilReload('superapp', userId)) return;

      // If user is logged in (disabled = false) and has seen the intro, fetch
      // the configurable Welcome Back message and auto-close after a few seconds.
      if (!disabled && userId && localStorage.getItem(`intro_shown_${userId}`) === 'true') {
        try {
          const { data: config, error } = await supabase
            .from('aiboard_simulator_configs')
            .select('welcome_back_text, welcome_back_auto_close_ms')
            .eq('module_name', 'Snabbb.io')
            .limit(1)
            .maybeSingle();

          let welcomeText = !error ? config?.welcome_back_text : null;
          const autoCloseMs = (!error && config?.welcome_back_auto_close_ms) || 6000;

          if (welcomeText && /\[name\]/i.test(welcomeText)) {
            let displayName: string | null = null;
            try {
              const { data: profile } = await supabase
                .from('profiles')
                .select('name, full_name')
                .eq('user_id', userId)
                .maybeSingle();
              displayName = profile?.name || profile?.full_name || null;
            } catch (err) {
              console.error("Error fetching profile for welcome back name:", err);
            }
            if (!displayName) displayName = userMeta?.name || null;
            if (!displayName && userEmail) displayName = userEmail.split('@')[0];
            // Never show a raw email address, even if it came from profiles.name/full_name.
            if (displayName && displayName.includes('@')) displayName = displayName.split('@')[0];

            welcomeText = displayName
              ? welcomeText.replace(/\[name\]/gi, displayName)
              : welcomeText
                  .replace(/,\s*\[name\]/gi, '')
                  .replace(/\[name\],\s*/gi, '')
                  .replace(/\[name\]/gi, '')
                  .replace(/\s{2,}/g, ' ')
                  .trim();
          }

          if (welcomeText) {
            setDialogSteps([welcomeText]);
            setDialogStep(0);
            currentDialogType.current = 'welcomeBack';
            emitSnabbbDiagnostic({ eventType: 'pet_dialogue_selected', appId: 'superapp', dialogType: 'welcomeBack', dialogueId: 'superapp:welcomeBack' });
            welcomeBackAutoCloseMsRef.current = autoCloseMs;
            tryActivateDialog();
          }
        } catch (err) {
          console.error("Error fetching welcome back message:", err);
        }
        return;
      }

      try {
        const { data: configs, error: configsError } = await supabase
          .from('aiboard_simulator_configs')
          .select('id')
          .eq('module_name', 'Snabbb.io')
          .limit(1);

        if (configsError) {
          // Infrastructure/query failure — do not mark the intro stage
          // complete; preserve the ability to retry on the next login/reload.
          return;
        }

        if (!configs || configs.length === 0) {
          // Query succeeded and confirmed no simulator config exists at all
          // for this module — there is no Intro to ever show. Mark the stage
          // complete so future post-login visits proceed to Welcome Back
          // instead of retrying the missing Intro forever.
          if (!disabled) markIntroCompleted(userId);
          return;
        }

        const configId = configs[0].id;

        const { data, error } = await supabase
          .from('aiboard_simulator_dialog_steps')
          .select('step_text, sort_order')
          .eq('config_id', configId)
          .eq('is_post_login', !disabled)
          .order('sort_order', { ascending: true });

        if (error) {
          // Infrastructure/query failure — do not mark the intro stage complete.
          return;
        }

        const steps = (data || [])
          .map((d: any) => d.step_text)
          .filter((text: any): text is string => typeof text === 'string' && text.trim().length > 0);

        if (steps.length > 0) {
          setDialogSteps(steps);
          setDialogStep(0);
          currentDialogType.current = 'intro';
          emitSnabbbDiagnostic({ eventType: 'pet_dialogue_selected', appId: 'superapp', dialogType: 'intro', dialogueId: 'superapp:intro' });
          tryActivateDialog();
          return;
        }

        // Query succeeded but returned no usable intro content (zero rows, or
        // every row was empty/whitespace-only) — there is nothing to show.
        // Mark the stage complete so this doesn't retry forever on every login.
        if (!disabled) markIntroCompleted(userId);
      } catch (err) {
        console.error("Error fetching dialog steps:", err);
      }
    };

    initDialog();
  }, [disabled, personalizedDialogueEnabled]);

  // ─── Meow message loop ────────────────────────────────────────────────────
  // FIX: dep array is only [disabled] — petStates and isDialogActive are read
  // via refs so changing them does NOT restart the loop (and cause instant meow).
  useEffect(() => {
    if (disabled) return;

    let isSubscribed = true;

    // FIX: helper that clears BOTH timers
    const clearAllTimers = () => {
      if (meowTimerRef.current)      { clearTimeout(meowTimerRef.current);      meowTimerRef.current = null; }
      if (meowInnerTimerRef.current) { clearTimeout(meowInnerTimerRef.current); meowInnerTimerRef.current = null; }
    };

    const runMeowLoop = async () => {
      try {
        const { data: configs } = await supabase.from('aiboard_meow_configs').select('id').limit(1);
        if (!configs || configs.length === 0) return;
        const configId = configs[0].id;

        // Read current states from ref — no stale closure
        const primaryState = petStatesRef.current[0] || 'Normal';

        const { data: timingData, error: timingError } = await supabase
          .from('aiboard_meow_timing')
          .select('message_duration_minutes, message_interval_minutes, disabled')
          .eq('config_id', configId)
          .eq('state', primaryState)
          .order('updated_at', { ascending: false })
          .limit(1);

        let activeTiming = timingData?.[0];

        if (timingError || !activeTiming || activeTiming.disabled) {
          if (primaryState !== 'Normal') {
            console.log(`[CatMascot] No active timing for "${primaryState}", falling back to "Normal"`);
          }
          const { data: normalTiming, error: nError } = await supabase
            .from('aiboard_meow_timing')
            .select('message_duration_minutes, message_interval_minutes, disabled')
            .eq('config_id', configId)
            .eq('state', 'Normal')
            .order('updated_at', { ascending: false })
            .limit(1);

          if (normalTiming?.[0] && !normalTiming[0].disabled) {
            activeTiming = normalTiming[0];
          } else {
            console.warn("[CatMascot] No active or Normal timing found. Meow loop aborted.", nError);
            return;
          }
        }

        // Fetch messages for ALL active states via ref
        const { data: msgsData, error: msgsError } = await supabase
          .from('aiboard_meow_messages')
          .select('message, state, sort_order')
          .eq('config_id', configId)
          .in('state', petStatesRef.current)
          .eq('is_audio', false)
          .order('state', { ascending: true })
          .order('sort_order', { ascending: true });

        if (msgsError) {
          console.error(`[CatMascot] Error fetching messages:`, msgsError);
          return;
        }

        if (!msgsData || msgsData.length === 0) {
          console.log(`[CatMascot] No messages found for states [${petStatesRef.current.join(', ')}]`);
          return;
        }

        const intervalMs = (activeTiming.message_interval_minutes || 0.25) * 60 * 1000;
        const durationMs  = (activeTiming.message_duration_minutes  || 0.1)  * 60 * 1000;

        console.log(`[CatMascot] Loop started: States=[${petStatesRef.current.join(', ')}], Msgs=${msgsData.length}, Interval=${intervalMs/1000}s, Duration=${durationMs/1000}s`);

        let currentIndex = 0;

        const loop = () => {
          // FIX: outer timer stored in meowTimerRef
          meowTimerRef.current = setTimeout(() => {
            if (!isSubscribed) return;

            // FIX: skip showing message while dialog is open — read via ref
            if (isDialogActiveMeowRef.current) {
              loop(); // wait another interval, don't show message
              return;
            }

            const seqMsg = msgsData[currentIndex].message;
            setMeowMsg(seqMsg);
            currentIndex = (currentIndex + 1) % msgsData.length;

            // FIX: inner timer stored in meowInnerTimerRef so cleanup can cancel it
            meowInnerTimerRef.current = setTimeout(() => {
              if (!isSubscribed) return;
              setMeowMsg(null);
              loop();
            }, durationMs);
          }, intervalMs);
        };

        loop();
      } catch (err) {
        console.error("Error setting up meow loop:", err);
      }
    };

    runMeowLoop();

    return () => {
      isSubscribed = false;
      clearAllTimers(); // FIX: clears both outer and inner timers
    };
  }, [disabled]); // FIX: only [disabled] — petStates/isDialogActive read via refs

  // ─── Audio loop ───────────────────────────────────────────────────────────
  const audioLoopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (disabled) return;

    let isSubscribed = true;

    const runAudioLoop = async () => {
      try {
        const { data: configs } = await supabase.from('aiboard_meow_configs').select('id').limit(1);
        if (!configs || configs.length === 0) return;
        const configId = configs[0].id;

        const { data: timingData } = await supabase
          .from('aiboard_meow_timing')
          .select('message_interval_minutes, disabled')
          .eq('config_id', configId)
          .eq('state', 'Audio')
          .order('updated_at', { ascending: false })
          .limit(1);

        const audioTiming = timingData?.[0];
        if (!audioTiming || audioTiming.disabled) return;

        const { data: msgsData } = await supabase
          .from('aiboard_meow_messages')
          .select('message')
          .eq('config_id', configId)
          .eq('state', 'Audio')
          .eq('is_audio', true);

        if (!msgsData || msgsData.length === 0) return;

        const intervalMs = (audioTiming.message_interval_minutes || 0.1) * 60 * 1000;

        const loop = () => {
          audioLoopTimerRef.current = setTimeout(() => {
            if (!isSubscribed) return;
            const randomMsg = msgsData[Math.floor(Math.random() * msgsData.length)].message;
            if (randomMsg) {
              const audioObj = new Audio(randomMsg);
              audioObj.play().catch(e => console.error("Audio playback error:", e));
            }
            loop();
          }, intervalMs);
        };

        loop();
      } catch (err) {
        console.error("Error setting up audio loop:", err);
      }
    };

    runAudioLoop();

    return () => {
      isSubscribed = false;
      if (audioLoopTimerRef.current) clearTimeout(audioLoopTimerRef.current);
    };
  }, [disabled]);

  // ─── PHASE 9D: local dialogue state → shared presentation contract ────────
  // Pure derivation from the SAME local state the pre-9D JSX rendered from —
  // no new state, no new persistence, no re-arbitration. Every currently
  // active App Gallery dialogue (legacy multi-step Intro, legacy single-step
  // Welcome Back, and every Phase 1A resolver candidate — including the
  // resolver-selected multi-step Legacy Intro) already renders through
  // exactly ONE of two visual shapes: `dialogSteps.length === 1` (message +
  // optional CTA + Close only — `personalizedActiveCandidate.action` is only
  // ever populated for real Phase 1A candidates, never legacy Intro/Welcome
  // Back, so the CTA button already only appears where it did before) or
  // `dialogSteps.length > 1` (multi-step Back/Next/Close, and no CTA is ever
  // shown for these). Mapping isDialogActive+dialogSteps.length onto
  // `kind: 'personalized'` vs `kind: 'sequence'` exactly reproduces this
  // existing behavior with zero visual/semantic loss.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    audioRef.current = new Audio('/pet-function/audio/cat-meow.mp3');
  }, []);

  const dialoguePresentation: CatDialoguePresentation = useMemo(() => {
    if (!isDialogActive || dialogSteps.length === 0) {
      return { kind: 'none' };
    }
    if (dialogSteps.length === 1) {
      return {
        kind: 'personalized',
        message: dialogSteps[0],
        action: personalizedActiveCandidate?.action
          ? {
              label: personalizedActiveCandidate.action.label,
              onClick: () => {
                // Exact pre-9D CTA order: run the frozen candidate's action
                // first, then close/persist dismissal — never a live re-read
                // of the candidate.
                emitSnabbbDiagnostic({
                  eventType: 'pet_dialogue_action_clicked',
                  appId: 'superapp',
                  dialogType: 'personalized',
                  actionType: personalizedActiveCandidate.action?.route || 'cta',
                  dialogueId: personalizedActiveCandidate.dialogueId,
                  triggerId: personalizedActiveCandidate.triggerId,
                  ruleVersion: personalizedActiveCandidate.ruleVersion,
                  evaluatedAt: personalizedActiveCandidate.evaluatedAt,
                });
                runPersonalizedAction(personalizedActiveCandidate);
                closeDialog('action_clicked');
              },
            }
          : undefined,
        onClose: () => closeDialog('close'),
      };
    }
    return {
      kind: 'sequence',
      steps: dialogSteps,
      stepIndex: dialogStep,
      onBack: () => setDialogStep((p) => Math.max(0, p - 1)),
      onNext: () => setDialogStep((p) => Math.min(dialogSteps.length - 1, p + 1)),
      onClose: () => closeDialog('close'),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDialogActive, dialogSteps, dialogStep, personalizedActiveCandidate]);

  // ─── Cat click handler ────────────────────────────────────────────────────
  // SharedCatMascot owns the generic click-meow visual animation internally
  // (gated on its own `isSleeping` prop) and calls this with no arguments
  // only when the click target isn't ignored and `!disabled`. Host remains
  // owner of: dismissing whatever dialogue is active, playing the actual
  // click sound (unconditionally — the pre-9D source never gated audio on
  // isPetSleeping, only the now-shared-owned visual animation had no such
  // gate either, so this preserves that exact ungated behavior), and the
  // parent's Cat → Virtual Pet callback.
  const handleCatClick = () => {
    if (!disabled) closeDialog('cat_click');
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
    if (!disabled && onCatClick) onCatClick();
  };

  // SharedCatMascot's own internal entry-walk effect captures this prop
  // once, at mount, and fires it exactly once when the Cat reaches its
  // final resting position (see its `onEntryWalkComplete` doc). This is the
  // sole setter for `isEntryWalkComplete` — flipping it here and
  // immediately re-running tryActivateDialog() is what lets a candidate
  // already selected/adopted mid-walk (see the adoption effects above,
  // which call tryActivateDialog() as soon as they resolve) activate the
  // instant arrival happens, rather than waiting on some unrelated future
  // render/effect to notice the ref changed.
  const handleEntryWalkComplete = () => {
    isEntryWalkComplete.current = true;
    tryActivateDialog();
  };

  if (!isPetIdentityReady || !selectedPetId) return null;

  return (
    <SharedCatMascot
      disabled={disabled}
      petId={selectedPetId}
      isSleeping={isPetSleeping}
      onSleepingChange={handleCatBedSleepChange}
      dialogue={dialoguePresentation}
      meowMessage={meowMsg}
      onCatClick={handleCatClick}
      spriteSheetUrls={CAT_SPRITE_SHEET_URLS}
      onEntryWalkComplete={handleEntryWalkComplete}
    />
  );
}
