"use client";
import { useState, useEffect, useRef } from 'react';
import { SharedCatMascot, useSharedCatDialogueRuntime, useSharedCatSleepSync, readSharedPetName, writeSharedPetName, getSharedPetNameStorageKey } from '../../cat';
import { normalizePetId } from '../../pet/publicOptions';
import { usePersonalizedInsightBridge } from './petDialogue/PersonalizedInsightBridge';
import { CAT_SPRITE_SHEET_URLS } from '../../resources';

// PHASE 3B NOTE (Cat dialogue runtime extraction): the mount-scoped
// shown-state, localStorage dismissal (new + legacy key compat),
// cross-tab sync, exact adopted-candidate/action binding, one-activation/
// no-cascade, and Intro/Personalized/Welcome-Back phase machinery all now
// live in @mrburdeveloperteam/pet-function/cat's
// useSharedCatDialogueRuntime(). This file is a LOCAL ADAPTER only: it
// fetches Content Studio's own data (session, AIBoard Intro/Welcome Back
// config, profile name resolution) and the PersonalizedInsightBridge
// candidate, and feeds them to the runtime as plain reactive values. No
// dialogue lifecycle mechanics are reimplemented here.
//
// KNOWN, ACCEPTED TIMING SEAM: Welcome Back content is now fetched
// eagerly (once Intro is completed and a userId is known) rather than
// only when the personalized reminder is NOT going to win, because the
// runtime's internal shown/dismissed eligibility state is intentionally
// not exposed back to hosts (that would leak runtime internals across
// the boundary this phase establishes). This costs one extra, harmless,
// read-only Supabase query in the case where the personalized reminder
// wins — it has no effect on what the user ever sees. The Intro fetch
// itself is still skipped entirely for an already-onboarded returning
// user, exactly as before, since that gate doesn't depend on runtime
// internals — see the `intro_shown_{userId}` checks below.

const PET_SLEEPING_KEY = 'pet_is_sleeping';
const PET_SLEEPING_UPDATED_AT_KEY = 'pet_is_sleeping_updated_at';
const APP_ID = 'content-studio';

export default function ContentStudioCatMascot({ supabase, onCatClick, disabled = false, initialPetName, initialIsSleeping, userId = null }) {
  // initialIsSleeping comes from the server; fall back to localStorage.
  const [isPetSleeping, setIsPetSleeping] = useState(() => {
    if (initialIsSleeping) return true;
    try { return localStorage.getItem(PET_SLEEPING_KEY) === 'true'; } catch { return false; }
  });
  const handleCatBedSleepChange = useSharedCatSleepSync(supabase, userId, setIsPetSleeping);
  // initialPetName comes from the server (layout.tsx) and is always correct;
  // fall back to localStorage for client-only apps (all other 6 apps).
  const initialResolvedPetName = initialPetName ?? readSharedPetName(userId);
  const [selectedPetId, setSelectedPetId] = useState(() => initialResolvedPetName ? normalizePetId(initialResolvedPetName) : null);
  const [isPetIdentityReady, setIsPetIdentityReady] = useState(() => Boolean(initialResolvedPetName));

  const [currentUserId, setCurrentUserId] = useState(null);
  const userMetaRef = useRef(null);
  const userEmailRef = useRef(null);

  const [introInput, setIntroInput] = useState({ status: 'not_ready' });
  const [welcomeBackInput, setWelcomeBackInput] = useState({ status: 'not_ready' });

  // Read-only: the already-resolved Phase-2B candidate published by
  // DashboardClient (null on every other route, or before it publishes —
  // see PersonalizedInsightBridge.tsx's header for why that's intentional).
  const bridgeEntry = usePersonalizedInsightBridge();

  // Maps Content Studio's own 3-way bridge shape ({status:'not_ready'} |
  // {status:'ready', candidate, onAction} | null) onto the shared
  // runtime's generic DialogueAdapter contract. `undefined` (no adapter
  // at all) is what tells the runtime "no publisher" — matching the
  // bridge's own `null` — while a `not_ready`/`ready` adapter tells it to
  // wait or arbitrate respectively. `candidate` (singular, this app's
  // current shape) becomes a one-or-zero-element `candidates[]` array —
  // the runtime itself only ever needs an ordered array, never a bare
  // singular candidate, so this is a pure shape adaptation, not new logic.
  const personalizedAdapter = disabled || bridgeEntry === null
    ? undefined
    : bridgeEntry.status === 'not_ready'
      ? { state: { status: 'not_ready' }, onAction: () => {} }
      : {
          state: { status: 'ready', candidates: bridgeEntry.candidate ? [bridgeEntry.candidate] : [] },
          onAction: bridgeEntry.onAction,
        };

  const { dialogue, closeActiveDialogue } = useSharedCatDialogueRuntime({
    appId: APP_ID,
    userId: currentUserId,
    disabled,
    intro: introInput,
    personalized: personalizedAdapter,
    welcomeBack: welcomeBackInput,
  });

  // Session + Intro content fetch. Mirrors the pre-migration initDialog()
  // exactly: skips the Intro fetch entirely for an already-onboarded
  // returning user (the runtime's own intro-completion check, same
  // localStorage key, would never consult introInput in that case anyway,
  // but fetching would still cost an unnecessary Supabase round-trip on
  // every load).
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      let userId = null;
      let userMeta = null;
      let userEmail = null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        userId = session?.user?.id || null;
        userMeta = session?.user?.user_metadata || null;
        userEmail = session?.user?.email || null;
        userMetaRef.current = userMeta;
        userEmailRef.current = userEmail;
        if (!cancelled) setCurrentUserId(userId);
      } catch (err) {
        console.error("Error fetching session in CatMascot:", err);
      }

      if (!disabled && userId && localStorage.getItem(`intro_shown_${userId}`) === 'true') {
        return;
      }

      try {
        const { data: configs, error: configsError } = await supabase
          .from('aiboard_simulator_configs')
          .select('id')
          .eq('module_name', 'Content Studio')
          .limit(1);

        if (configsError) return;

        if (!configs || configs.length === 0) {
          if (!cancelled) setIntroInput({ status: 'ready', steps: [] });
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

        if (!cancelled) setIntroInput({ status: 'ready', steps });
      } catch (err) {
        console.error("Error fetching dialog steps:", err);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [disabled]);

  // Welcome Back content fetch (see the file-header note on the eager-
  // fetch timing seam). Content/name-resolution logic unchanged from the
  // pre-migration activateWelcomeBack().
  useEffect(() => {
    if (disabled || !currentUserId) return;
    if (localStorage.getItem(`intro_shown_${currentUserId}`) !== 'true') return;

    let cancelled = false;
    const run = async () => {
      const userMeta = userMetaRef.current;
      const userEmail = userEmailRef.current;
      try {
        const { data: config, error } = await supabase
          .from('aiboard_simulator_configs')
          .select('welcome_back_text, welcome_back_auto_close_ms')
          .eq('module_name', 'Content Studio')
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

        if (!cancelled) setWelcomeBackInput({ status: 'ready', message: welcomeText || null, autoCloseMs });
      } catch (err) {
        console.error("Error fetching welcome back message:", err);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [disabled, currentUserId]);

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
    const saved = localStorage.getItem('pet_stats');
    const lastSavedAt = localStorage.getItem('pet_last_saved_at');
    const isFresh = lastSavedAt && (Date.now() - new Date(lastSavedAt).getTime() < 300000);
    if (saved && isFresh) {
      try { updateStateFromStats(JSON.parse(saved), lastSavedAt); } catch (e) { /* ignore */ }
    }

    const readLocalSleepState = () => {
      const savedSleeping = localStorage.getItem(PET_SLEEPING_KEY);
      if (savedSleeping !== null) {
        setIsPetSleeping(savedSleeping === 'true');
      }
    };

    readLocalSleepState();
    const cachedPetName = readSharedPetName(userId);
    if (cachedPetName) { setSelectedPetId(normalizePetId(cachedPetName)); setIsPetIdentityReady(true); }
    else if (!initialPetName) { setSelectedPetId(null); setIsPetIdentityReady(false); }

    const handlePetSleepChange = (event) => {
      setIsPetSleeping(!!event.detail);
    };

    const handlePetSelectionChange = (event) => {
      setSelectedPetId(normalizePetId(event.detail));
      writeSharedPetName(userId, event.detail);
      setIsPetIdentityReady(true);
    };

    const handleStorage = (event) => {
      if (event.key === PET_SLEEPING_KEY) {
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

        if (!error) {
          const nextSleeping = !!data?.is_sleeping;
          if (data) {
            setIsPetSleeping(nextSleeping);
            localStorage.setItem(PET_SLEEPING_KEY, String(nextSleeping));
            localStorage.setItem(PET_SLEEPING_UPDATED_AT_KEY, data.updated_at || new Date().toISOString());
            setSelectedPetId(normalizePetId(data.pet_name));
            writeSharedPetName(session.user.id, data.pet_name);
            updateStateFromStats(data, data.updated_at);
          } else {
            setSelectedPetId(normalizePetId(null));
          }
          setIsPetIdentityReady(true);
        }
      } catch (err) {
        console.error('Error fetching pet stats:', err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 120000);
    // Staggered retries: SSO exchange can take 0.5–4s; the first successful call
    // that finds a session will set the correct pet sprite.
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
  }, [disabled, userId, initialPetName]);

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

  if (!isPetIdentityReady || !selectedPetId) return null;

  return (
    <SharedCatMascot
      disabled={disabled}
      petId={selectedPetId}
      isSleeping={isPetSleeping}
      onSleepingChange={handleCatBedSleepChange}
      dialogue={dialogue}
      meowMessage={meowMsg}
      onCatClick={() => {
        closeActiveDialogue();
        onCatClick?.();
      }}
      spriteSheetUrls={CAT_SPRITE_SHEET_URLS}
    />
  );
}
