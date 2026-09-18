"use client";
// PHASE 5B (Cat Presentation + Dialogue Runtime migration): this file is
// now a LOCAL host adapter only — sprite rendering, entry-walk, click-to-
// move, and the generic dialogue lifecycle (mount-scoped shown-tracking,
// dismissal persistence, cross-tab sync, exact-adopted-candidate binding,
// one-activation/no-cascade, Intro/Welcome-Back timing) all live in
// `@mrburdeveloperteam/pet-function/cat`'s `SharedCatMascot` +
// `useSharedCatDialogueRuntime`. This component's job is: (1) resolve the
// current user/pet/sleep state exactly as before, (2) fetch To-Do's own
// Intro/Welcome-Back content and read the personalized bridge (published
// by Home.tsx), reactively feeding them into the shared runtime's inputs,
// (3) run the pet-mood polling + ambient meow loop + audio loop, all
// moved mechanically, not rewritten, and (4) preserve the working
// click-meow sound, which the shared package intentionally does not own.
//
// NOT migrated in this phase, and deliberately unchanged: Molar AI,
// Virtual Pet, and the mobile-safe `getSafeX` entry-walk/click-target
// clamp that To-Do's previous local implementation had — `SharedCatMascot`
// owns its own position state internally and has no host hook for this.
// Manual browser parity is the acceptance gate for whether that specific
// behavioral difference is acceptable.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SharedCatMascot, useSharedCatDialogueRuntime, readSharedPetName, writeSharedPetName, getSharedPetNameStorageKey, resolveCatAuthStatus } from '../../cat';
import { normalizePetId } from '../../pet/publicOptions';
import { usePersonalizedInsightBridge } from './petDialogue/PersonalizedInsightBridge';
import { CAT_SPRITE_SHEET_URLS } from '../../resources';

const PET_SLEEPING_KEY = 'pet_is_sleeping';
const PET_SLEEPING_UPDATED_AT_KEY = 'pet_is_sleeping_updated_at';
const APP_ID = 'todo';
// PHASE TODO-CAT-CACHE: this Cat presentation cache is host-owned and
// account-sensitive (pet name/mood/sleep state), so it must never bleed
// across accounts on a shared browser profile. Own namespace —
// `snabbb_cat:<userId>:<key>` — deliberately distinct from Shared's own
// `snabbb_pet:<userId>:<key>` (no shared contract for reusing that one).
// `userId` absent -> no-op/null: presentation optimization only, never a
// guest-mode persistent store.
const CAT_CACHE_PREFIX = 'snabbb_cat';
const getCatStorageKey = (userId, key) => (userId ? `${CAT_CACHE_PREFIX}:${userId}:${key}` : null);
const readCatStorage = (userId, key) => {
  const storageKey = getCatStorageKey(userId, key);
  if (!storageKey) return null;
  try { return localStorage.getItem(storageKey); } catch { return null; }
};
const writeCatStorage = (userId, key, value) => {
  const storageKey = getCatStorageKey(userId, key);
  if (!storageKey) return;
  try { localStorage.setItem(storageKey, value); } catch { /* ignore */ }
};
// Format preserved EXACTLY — matches the shared runtime's own internal
// `cat/internal/introCompletion.ts` key (user-scoped, no appId segment).
// Used here ONLY to skip an unnecessary Supabase query for a user who has
// already completed Intro, mirroring the pre-migration optimization — the
// shared runtime independently makes the actual show/skip decision itself.
const introCompletedLocally = (uid) => {
  if (!uid) return false;
  try {
    return localStorage.getItem(`intro_shown_${uid}`) === 'true';
  } catch {
    return false;
  }
};

// `userId` is To-Do's own authenticated Supabase auth id (`session.user.id`
// in App.tsx), threaded down the same way TodoVirtualPet's is — never a
// second independent `getSession()` lifecycle. `null` for the pre-login
// `disabled` instance, where no account-sensitive cache should be touched.
export function createTodoCatMascot(supabase) {
return function TodoCatMascot({ onCatClick, disabled = false, userId = null, authStatus }) {
  const [isPetSleeping, setIsPetSleeping] = useState(() => readCatStorage(userId, PET_SLEEPING_KEY) === 'true');
  const resolvedAuthStatus = resolveCatAuthStatus(authStatus, disabled, userId);
  const initialPetName = readSharedPetName(userId);
  const [selectedPetId, setSelectedPetId] = useState(() => resolvedAuthStatus === 'guest' || initialPetName ? normalizePetId(initialPetName) : null);
  const [isPetIdentityReady, setIsPetIdentityReady] = useState(() => resolvedAuthStatus === 'guest' || Boolean(initialPetName));

  const [meowMsg, setMeowMsg] = useState(null);
  const [petStates, setPetStates] = useState(['Normal']);
  const meowTimerRef = useRef(null);
  const audioLoopTimerRef = useRef(null);
  const audioRef = useRef(null);

  // Clear message bubble immediately when state changes
  useEffect(() => {
    setMeowMsg(null);
  }, [petStates]);

  const petStatesRef = useRef(['Normal']);

  // --- Pet mood/sleep/identity polling — unchanged from pre-migration source ---
  useEffect(() => {
    if (disabled) return;

    const computeStates = (stats, prevStates) => {
      const HUNGRY_ENTER = 30, HUNGRY_EXIT = 35;
      const DIRTY_ENTER = 30, DIRTY_EXIT = 35;
      const ENERGY_ENTER = 30, ENERGY_EXIT = 35;
      const HAPPY_ENTER = 40, HAPPY_EXIT = 45;

      const active = [];
      if (stats.hunger < HUNGRY_ENTER || (prevStates.includes('Hungry') && stats.hunger < HUNGRY_EXIT)) active.push('Hungry');
      if (stats.hygiene < DIRTY_ENTER || (prevStates.includes('Dirty') && stats.hygiene < DIRTY_EXIT)) active.push('Dirty');
      if (stats.energy < ENERGY_ENTER || (prevStates.includes('Low Energy') && stats.energy < ENERGY_EXIT)) active.push('Low Energy');
      if (stats.happiness < HAPPY_ENTER || (prevStates.includes('Unhappy') && stats.happiness < HAPPY_EXIT)) active.push('Unhappy');

      if (active.length === 0) active.push('Normal');
      return active;
    };

    const updateStateFromStats = (stats, updatedAt) => {
      if (!stats) return;

      let finalStats = { ...stats };

      // Apply offline decay based on updated_at
      if (updatedAt) {
        const elapsedSecs = Math.max(0, (Date.now() - new Date(updatedAt).getTime()) / 1000);
        if (elapsedSecs > 0) {
          finalStats.hunger = Math.max(0, (stats.hunger || 0) - 0.01 * elapsedSecs);
          finalStats.energy = Math.max(0, (stats.energy || 0) - 0.005 * elapsedSecs);
          finalStats.hygiene = Math.max(0, (stats.hygiene || 0) - 0.004 * elapsedSecs);
          finalStats.happiness = Math.max(0, (stats.happiness || 0) - 0.006 * elapsedSecs);
        }
      }

      const newStates = computeStates(finalStats, petStatesRef.current);
      const isDifferent = newStates.length !== petStatesRef.current.length || !newStates.every((v, i) => v === petStatesRef.current[i]);

      if (isDifferent) {
        console.log('[CatMascot] States: ' + petStatesRef.current.join(', ') + ' -> ' + newStates.join(', '));
        petStatesRef.current = newStates;
        setPetStates(newStates);
      }
    };

    // 1. Initial check from localStorage (with 5-min freshness check)
    const saved = readCatStorage(userId, 'pet_stats');
    const lastSavedAt = readCatStorage(userId, 'pet_last_saved_at');
    const isFresh = lastSavedAt && (Date.now() - new Date(lastSavedAt).getTime() < 300000);
    if (saved && isFresh) {
      try { updateStateFromStats(JSON.parse(saved), lastSavedAt); } catch (e) { /* ignore */ }
    }

    const readLocalSleepState = () => {
      const savedSleeping = readCatStorage(userId, PET_SLEEPING_KEY);
      if (savedSleeping !== null) {
        setIsPetSleeping(savedSleeping === 'true');
      }
    };

    readLocalSleepState();
    const cachedPetName = readSharedPetName(userId);
    if (resolvedAuthStatus === 'guest') { setSelectedPetId(normalizePetId(null)); setIsPetIdentityReady(true); }
    else if (cachedPetName) { setSelectedPetId(normalizePetId(cachedPetName)); setIsPetIdentityReady(true); }
    else { setSelectedPetId(null); setIsPetIdentityReady(false); }

    const handlePetSleepChange = (event) => {
      setIsPetSleeping(!!event.detail);
    };

    const handlePetSelectionChange = (event) => {
      setSelectedPetId(normalizePetId(event.detail));
      writeSharedPetName(userId, event.detail);
      setIsPetIdentityReady(true);
    };

    const handleStorage = (event) => {
      // Cross-tab sync for THIS user only — compares against this user's
      // own scoped keys, not the bare legacy names, so a stray legacy
      // write (or another user's tab) can never trigger it.
      if (event.key === getCatStorageKey(userId, PET_SLEEPING_KEY)) {
        setIsPetSleeping(event.newValue === 'true');
      }
      if (event.key === getSharedPetNameStorageKey(userId)) {
        setSelectedPetId(normalizePetId(event.newValue));
      }
    };

    window.addEventListener('virtual-pet-sleep-change', handlePetSleepChange);
    window.addEventListener('virtual-pet-selection-change', handlePetSelectionChange);
    window.addEventListener('storage', handleStorage);

    // 2. Fetch from Supabase for latest data
    const fetchStats = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const { data, error } = await supabase
          .from('inventory_pet')
          .select('hunger, hygiene, energy, happiness, is_sleeping, pet_name, updated_at')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (data && !error) {
          const nextSleeping = !!data.is_sleeping;
          setIsPetSleeping(nextSleeping);
          writeCatStorage(userId, PET_SLEEPING_KEY, String(nextSleeping));
          writeCatStorage(userId, PET_SLEEPING_UPDATED_AT_KEY, data.updated_at || new Date().toISOString());
          setSelectedPetId(normalizePetId(data.pet_name));
          writeSharedPetName(userId, data.pet_name);
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
  }, [disabled, userId, resolvedAuthStatus]);

  // --- Intro content (To-Do's own AIBoard config) ---
  const [introState, setIntroState] = useState({ status: 'not_ready' });

  useEffect(() => {
    let cancelled = false;

    const fetchIntro = async () => {
      // Skip the query entirely if this user has already completed Intro —
      // matches the pre-migration optimization exactly. Pre-login
      // (disabled=true, userId=null) always proceeds, since the
      // pre-login intro sequence is never marked complete either (see
      // introCompletedLocally's own comment).
      if (!disabled && userId && introCompletedLocally(userId)) return;

      try {
        const { data: configs, error: configsError } = await supabase
          .from('aiboard_simulator_configs')
          .select('id')
          .eq('module_name', 'To-Do Manager')
          .limit(1);

        if (configsError) {
          // Infrastructure/query failure — leave status 'not_ready' so the
          // runtime keeps waiting; retry happens naturally on next mount.
          return;
        }

        if (!configs || configs.length === 0) {
          // No Intro configured at all — report ready with zero steps so
          // the shared runtime marks Intro complete itself and proceeds.
          if (!cancelled) setIntroState({ status: 'ready', steps: [] });
          return;
        }

        const configId = configs[0].id;

        const { data, error } = await supabase
          .from('aiboard_simulator_dialog_steps')
          .select('step_text, sort_order')
          .eq('config_id', configId)
          .eq('is_post_login', !disabled)
          .order('sort_order', { ascending: true });

        if (error) return;

        const steps = (data || [])
          .map((d) => d.step_text)
          .filter((text) => typeof text === 'string' && text.trim().length > 0);

        if (!cancelled) setIntroState({ status: 'ready', steps });
      } catch (err) {
        console.error('Error fetching dialog steps:', err);
      }
    };

    fetchIntro();
    return () => { cancelled = true; };
  }, [disabled, userId]);

  // --- Welcome Back content (To-Do's own AIBoard config + name interpolation) ---
  const [welcomeBackState, setWelcomeBackState] = useState({ status: 'not_ready' });

  useEffect(() => {
    let cancelled = false;

    const fetchWelcomeBack = async () => {
      // Same gate as the pre-migration `arbitrateReturningUser` had before
      // ever calling `activateWelcomeBack`: never for the disabled
      // instance, never before this user has completed Intro. Fetched
      // reactively once eligible rather than only after the shared
      // runtime has actually decided Welcome Back is the outcome (whether
      // because no publisher is mounted, or the candidate pool is empty)
      // — a known, accepted timing seam (one extra, harmless read), since
      // the runtime itself still only ever SHOWS this once it
      // independently determines Welcome Back is appropriate.
      if (disabled || !userId || !introCompletedLocally(userId)) return;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userMeta = session?.user?.user_metadata || null;
        const userEmail = session?.user?.email || null;

        const { data: config, error } = await supabase
          .from('aiboard_simulator_configs')
          .select('welcome_back_text, welcome_back_auto_close_ms')
          .eq('module_name', 'To-Do Manager')
          .limit(1)
          .maybeSingle();

        let welcomeText = !error ? config?.welcome_back_text : null;
        const autoCloseMs = (!error && config?.welcome_back_auto_close_ms) || 6000;

        if (welcomeText && /\[name\]/i.test(welcomeText)) {
          let displayName = null;
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('name, full_name')
              .eq('user_id', userId)
              .maybeSingle();
            displayName = profile?.name || profile?.full_name || null;
          } catch (err) {
            console.error('Error fetching profile for welcome back name:', err);
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

        if (!cancelled) {
          setWelcomeBackState(
            welcomeText ? { status: 'ready', message: welcomeText, autoCloseMs } : { status: 'not_ready' }
          );
        }
      } catch (err) {
        console.error('Error fetching welcome back message:', err);
      }
    };

    fetchWelcomeBack();
    return () => { cancelled = true; };
  }, [disabled, userId]);

  // --- Personalized (Overdue/High/Today task) reminder — unchanged bridge read ---
  const bridgeEntry = usePersonalizedInsightBridge();

  // Family priority (Overdue High > High Today > Normal Tasks Today >
  // Nothing Today) is resolved entirely upstream by Home.tsx/
  // buildTodoDialoguePool.ts — this adapter only reshapes the bridge's
  // `null | {status:'not_ready'} | {status:'ready', candidates}` shape
  // into the shared runtime's `PersonalizedDialogueState` shape. `null`
  // (no publisher mounted) maps directly onto the shared runtime's own
  // "no personalized adapter" handling, which already treats a null
  // `state` as "proceed straight to Welcome Back" — the exact same
  // semantics this app's own `bridgeState === null` branch had.
  const personalizedState = useMemo(() => {
    if (bridgeEntry === null) return null;
    if (bridgeEntry.status === 'not_ready') return { status: 'not_ready' };
    const candidates = Array.isArray(bridgeEntry.candidates) ? bridgeEntry.candidates : [];
    return { status: 'ready', candidates };
  }, [bridgeEntry]);

  // The bridge's `onAction(candidate)` already takes the exact candidate
  // to act on (see PersonalizedInsightBridge.tsx) — the shared runtime
  // freezes this pair in its own refs at adoption time and passes the
  // exact adopted candidate back into it, never a live re-resolution.
  const personalizedOnAction = useCallback((candidate) => {
    if (bridgeEntry && bridgeEntry.status === 'ready') bridgeEntry.onAction(candidate);
  }, [bridgeEntry]);

  const { dialogue, closeActiveDialogue } = useSharedCatDialogueRuntime({
    appId: APP_ID,
    userId,
    disabled,
    intro: introState,
    personalized: { state: personalizedState, onAction: personalizedOnAction },
    welcomeBack: welcomeBackState,
  });

  // --- Ambient meow loop — unchanged from pre-migration source ---
  useEffect(() => {
    if (disabled || dialogue.kind !== 'none') return;

    let isSubscribed = true;

    const runMeowLoop = async () => {
      try {
        const { data: configs } = await supabase.from('aiboard_meow_configs').select('id').limit(1);
        if (!configs || configs.length === 0) return;
        const configId = configs[0].id;

        const primaryState = petStates[0] || 'Normal';

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
            console.log(`[CatMascot] No active timing for "${primaryState}" (Error: ${timingError?.message}), falling back to "Normal"`);
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

        // Fetch messages for ALL active states
        const { data: msgsData, error: msgsError } = await supabase
          .from('aiboard_meow_messages')
          .select('message, state, sort_order')
          .eq('config_id', configId)
          .in('state', petStates)
          .eq('is_audio', false)
          .order('state', { ascending: true })
          .order('sort_order', { ascending: true });

        if (msgsError) {
          console.error(`[CatMascot] Error fetching messages for states [${petStates.join(', ')}]:`, msgsError);
          return;
        }

        if (!msgsData || msgsData.length === 0) {
          console.log(`[CatMascot] No messages found for states [${petStates.join(', ')}]`);
          return;
        }

        const intervalMs = (activeTiming.message_interval_minutes || 0.25) * 60 * 1000;
        const durationMs = (activeTiming.message_duration_minutes || 0.1) * 60 * 1000;

        console.log(`[CatMascot] Loop started: States=[${petStates.join(', ')}], Msgs=${msgsData.length}, Interval=${intervalMs / 1000}s, Duration=${durationMs / 1000}s`);

        let currentIndex = 0;

        const loop = () => {
          meowTimerRef.current = setTimeout(() => {
            if (!isSubscribed) return;
            const seqMsg = msgsData[currentIndex].message;
            setMeowMsg(seqMsg);
            currentIndex = (currentIndex + 1) % msgsData.length;

            setTimeout(() => {
              if (isSubscribed) setMeowMsg(null);
              loop();
            }, durationMs);
          }, intervalMs);
        };

        loop();
      } catch (err) {
        console.error('Error setting up meow loop:', err);
      }
    };

    runMeowLoop();

    return () => {
      isSubscribed = false;
      if (meowTimerRef.current) clearTimeout(meowTimerRef.current);
    };
  }, [disabled, dialogue.kind, petStates]);

  // --- Ambient audio loop — unchanged from pre-migration source ---
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
              audioObj.play().catch((e) => console.error("Audio playback error:", e));
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

  // --- Click-meow sound + Virtual Pet open — preserved exactly, host-side ---
  useEffect(() => {
    audioRef.current = new Audio('/pet-function/audio/cat-meow.mp3');
  }, []);

  const handleCatClick = useCallback(() => {
    // Same ordering as the pre-migration source: close any open dialogue
    // first (skipped in disabled/pre-login mode), then play the click
    // sound, then invoke the host's Virtual Pet open callback.
    if (!disabled) {
      closeActiveDialogue();
    }
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
    if (!disabled && onCatClick) onCatClick();
  }, [disabled, closeActiveDialogue, onCatClick]);

  if (!isPetIdentityReady || !selectedPetId) return null;

  return (
    <SharedCatMascot
      disabled={disabled}
      petId={selectedPetId}
      isSleeping={isPetSleeping}
      dialogue={dialogue}
      meowMessage={meowMsg}
      onCatClick={handleCatClick}
      spriteSheetUrls={CAT_SPRITE_SHEET_URLS}
    />
  );
};
}
