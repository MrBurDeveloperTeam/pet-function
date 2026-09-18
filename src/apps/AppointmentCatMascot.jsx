'use client';
import { useState, useEffect, useRef } from 'react';
import { useSharedCatDialogueRuntime, SharedCatMascot, readSharedPetName, writeSharedPetName, getSharedPetNameStorageKey, resolveCatAuthStatus } from '../cat';

import { normalizePetId } from '../pet/publicOptions';
import { CAT_SPRITE_SHEET_URLS } from '../resources';

const PET_SLEEPING_KEY = 'pet_is_sleeping';
const PET_SLEEPING_UPDATED_AT_KEY = 'pet_is_sleeping_updated_at';

// APPOINTMENTS-2: this Cat presentation cache (pet mood/sleep stats used
// for the ambient meow bubble/sleep icon/selected sprite) is host-owned and
// account-sensitive, so it must never bleed across accounts on a shared
// browser profile. Own namespace — `snabbb_cat:<userId>:<key>` — matching
// the same fix already accepted for App Gallery and Inventory's own
// CatMascot. `userId` absent -> no-op/null: presentation optimization
// only, never a guest-mode persistent store (a guest simply uses component
// defaults for the session, exactly as before this fix).
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

export default function AppointmentCatMascot({ supabase, onCatClick, disabled = false, personalizedInsightState = null, catCacheOwnerId = null, authStatus }) {
  const [isPetSleeping, setIsPetSleeping] = useState(() => readCatStorage(catCacheOwnerId, PET_SLEEPING_KEY) === 'true');
  const resolvedAuthStatus = resolveCatAuthStatus(authStatus, disabled, catCacheOwnerId);
  const initialPetName = readSharedPetName(catCacheOwnerId);
  const [selectedPetId, setSelectedPetId] = useState(() => resolvedAuthStatus === 'guest' || initialPetName ? normalizePetId(initialPetName) : null);
  const [isPetIdentityReady, setIsPetIdentityReady] = useState(() => resolvedAuthStatus === 'guest' || Boolean(initialPetName));

  // ─── PHASE 8B: Shared Cat Dialogue Runtime ──────────────────────────────
  // The mechanics previously implemented locally here (mount-scoped shown
  // tracking, localStorage dismissal persistence + cross-tab sync,
  // exact-adopted-candidate/action binding, one-activation/no-cascade,
  // entry-walk-gated activation, Welcome Back auto-close) now live entirely
  // in `useSharedCatDialogueRuntime`. What stays local, unchanged in
  // content, is exactly what's genuinely Appointments-specific: resolving
  // the authenticated user id, and fetching Intro/Welcome Back CONTENT
  // (module_name/table names, [name] interpolation) — the runtime only
  // ever receives already-resolved, reactive `{status, ...}` inputs, never
  // fetches anything itself.
  const [currentUserId, setCurrentUserId] = useState(null);
  const userMetaRef = useRef(null);
  const userEmailRef = useRef(null);

  // Resolve the authenticated user id once per mount — the SAME session
  // read the pre-migration `initDialog()` performed, just decoupled from
  // the content-fetch effects below so each can react to `currentUserId`
  // independently.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        userMetaRef.current = session?.user?.user_metadata || null;
        userEmailRef.current = session?.user?.email || null;
        setCurrentUserId(session?.user?.id || null);
      } catch (err) {
        console.error('Error fetching session in CatMascot:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [disabled]);

  // Post-Login Intro content — reactive `{status, steps}` input for the
  // shared runtime. Only fetched when this user hasn't already completed
  // the Intro stage (same `intro_shown_${uid}` localStorage key the
  // runtime itself reads/writes — see the runtime's own doc), matching the
  // pre-migration query-avoidance behavior exactly. A configs/steps query
  // failure leaves `introState` at `{status:'not_ready'}` so the runtime
  // never marks the stage complete and this retries on the next
  // login/reload — identical to the pre-migration "do not mark complete on
  // infra failure" behavior.
  const [introState, setIntroState] = useState({ status: 'not_ready' });

  useEffect(() => {
    if (disabled) return;
    if (!currentUserId) return;
    if (localStorage.getItem(`intro_shown_${currentUserId}`) === 'true') return;

    let cancelled = false;
    (async () => {
      try {
        const { data: configs, error: configsError } = await supabase
          .from('aiboard_simulator_configs')
          .select('id')
          .eq('module_name', 'Appointment')
          .limit(1);

        if (configsError) return;

        if (!configs || configs.length === 0) {
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
          .map(d => d.step_text)
          .filter(text => typeof text === 'string' && text.trim().length > 0);

        if (!cancelled) setIntroState({ status: 'ready', steps });
      } catch (err) {
        console.error('Error fetching dialog steps:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [disabled, currentUserId]);

  // Welcome Back content — reactive `{status, message, autoCloseMs}` input.
  // KNOWN, ACCEPTED TIMING SEAM (same pattern established in the Molar AI
  // empty-state fetch across this whole migration series): fetched as soon
  // as the user id resolves, rather than only lazily once the runtime's own
  // arbitration has already decided Personalized has no eligible candidate.
  // This is one extra harmless read query per activation in the case where
  // a Personalized reminder ends up showing instead — the runtime itself
  // still gates actually DISPLAYING Welcome Back behind its own internal
  // arbitration, so this never changes which dialogue the user sees or when.
  const [welcomeBackState, setWelcomeBackState] = useState({ status: 'not_ready' });

  useEffect(() => {
    if (disabled) return;
    if (!currentUserId) return;

    let cancelled = false;
    (async () => {
      try {
        const { data: config, error } = await supabase
          .from('aiboard_simulator_configs')
          .select('welcome_back_text, welcome_back_auto_close_ms')
          .eq('module_name', 'Appointment')
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
              .eq('user_id', currentUserId)
              .maybeSingle();
            displayName = profile?.name || profile?.full_name || null;
          } catch (err) {
            console.error("Error fetching profile for welcome back name:", err);
          }
          if (!displayName) displayName = userMetaRef.current?.name || null;
          if (!displayName && userEmailRef.current) displayName = userEmailRef.current.split('@')[0];
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
            welcomeText
              ? { status: 'ready', message: welcomeText, autoCloseMs }
              : { status: 'ready', message: null }
          );
        }
      } catch (err) {
        console.error("Error fetching welcome back message:", err);
      }
    })();

    return () => { cancelled = true; };
  }, [disabled, currentUserId]);

  // Personalized candidate pool — App.jsx already computes this as the
  // three-way `{status:'not_ready'}` / `{status:'ready', candidates, onAction}`
  // contract (see App.jsx's `personalizedInsightState`); this just adapts it
  // to the shared runtime's `DialogueAdapter` shape (`state` + `onAction`
  // as sibling fields, `candidates` always an array).
  const personalizedState = personalizedInsightState?.status === 'ready'
    ? { status: 'ready', candidates: personalizedInsightState.candidates || [] }
    : { status: 'not_ready' };

  const { dialogue, closeActiveDialogue } = useSharedCatDialogueRuntime({
    appId: 'appointments',
    userId: currentUserId,
    disabled,
    intro: introState,
    personalized: {
      state: personalizedState,
      onAction: personalizedInsightState?.onAction || (() => {}),
    },
    welcomeBack: welcomeBackState,
  });

  const [meowMsg, setMeowMsg] = useState(null);
  const [petStates, setPetStates] = useState(['Normal']);
  const meowTimerRef = useRef(null);

  // Clear message bubble immediately when state changes
  useEffect(() => {
    setMeowMsg(null);
  }, [petStates]);

  const petStatesRef = useRef(['Normal']);

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
    const saved = readCatStorage(catCacheOwnerId, 'pet_stats');
    const lastSavedAt = readCatStorage(catCacheOwnerId, 'pet_last_saved_at');
    const isFresh = lastSavedAt && (Date.now() - new Date(lastSavedAt).getTime() < 300000);
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

    const handlePetSleepChange = (event) => {
      setIsPetSleeping(!!event.detail);
    };

    const handlePetSelectionChange = (event) => {
      setSelectedPetId(normalizePetId(event.detail));
      writeSharedPetName(catCacheOwnerId, event.detail);
      setIsPetIdentityReady(true);
    };

    // Cross-tab sync: only ever react to a storage event for THIS owner's
    // exact scoped key — a foreign/other-account key (or an old orphaned
    // bare key) must never be able to update this tab's Cat presentation.
    const scopedSleepKey = getCatStorageKey(catCacheOwnerId, PET_SLEEPING_KEY);
    const scopedNameKey = getSharedPetNameStorageKey(catCacheOwnerId);
    const handleStorage = (event) => {
      if (scopedSleepKey && event.key === scopedSleepKey) {
        setIsPetSleeping(event.newValue === 'true');
      }
      if (scopedNameKey && event.key === scopedNameKey) {
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
        console.error("Error setting up meow loop:", err);
      }
    };

    runMeowLoop();

    return () => {
      isSubscribed = false;
      if (meowTimerRef.current) clearTimeout(meowTimerRef.current);
    };
  }, [disabled, dialogue.kind, petStates]);

  const audioLoopTimerRef = useRef(null);

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

  // Click sound stays host-owned — SharedCatMascot bundles no audio asset
  // using the shared pet-function click-audio resource
  // click-sound reference already had no matching public/ file, so this
  // preserves that exact non-behavior for every extracted app). Created
  // once per mount, same as the pre-8C entry-walk effect used to do.
  const audioRef = useRef(null);
  useEffect(() => {
    audioRef.current = new Audio('/pet-function/audio/cat-meow.mp3');
  }, []);

  // Host `onCatClick`: SharedCatMascot already owns the click-meow
  // ANIMATION (gated on the `isSleeping` prop passed below) and the
  // disabled-suppression check internally — this only needs to run the
  // genuinely host-owned effects: dismiss whatever dialogue is showing,
  // play the click sound, then hand off to the parent's own Cat->Virtual
  // Pet callback. Preserves the exact pre-8C ordering (dismiss, then
  // sound, then parent callback).
  const handleCatClick = () => {
    if (!disabled) {
      closeActiveDialogue();
    }
    if (!isPetSleeping && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => { });
    }
    if (!disabled && onCatClick) onCatClick();
  };

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
}
