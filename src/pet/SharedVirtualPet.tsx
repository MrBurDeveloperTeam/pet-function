'use client';

/**
 * Public Virtual Pet entry point — real implementation (Phase 3D),
 * replacing the Phase 2 skeleton (`useMolarExperienceConfig()` call only,
 * rendered `null`).
 *
 * Ported from Content Studio's `src/VirtualPet/VirtualPetContainer.tsx`
 * (`VirtualPetContainer` + `VirtualPetContent`). Behavioral differences
 * from the original, all deliberate:
 *
 *   - `GameStateProvider` → `SharedPetProvider` (this package's generic
 *     runtime, `src/pet/runtime/SharedPetRuntime.tsx`), fed a
 *     `PetRepository` + opaque `userId` passed in as direct props (see
 *     `SharedVirtualPetProps` below for why props, not config context)
 *     instead of resolving `supabase.auth.getSession()` internally.
 *   - Geo-detection/currency-resolution (`detectAndLogVisit`,
 *     `virtual_pet_visits` writes) is Content-Studio-specific and
 *     Supabase-coupled — it stays entirely in the host's own composition
 *     wrapper, which resolves a `currencyCode` and passes it in as a
 *     prop, exactly mirroring how `VirtualPetContainer` computed
 *     `detectedCurrency` before handing it to `GameStateProvider`.
 *   - Landscape/fullscreen release now ALWAYS runs before `onClose()`
 *     fires while a landscape-mode game is active — not only from the
 *     in-room back button. This closes a real gap: Content Studio's
 *     original only released landscape mode via `handleCloseGame`
 *     (finishing a game normally); closing the ENTIRE Virtual Pet overlay
 *     while a landscape game was still active left orientation
 *     lock/fullscreen stuck. Appointments' `VirtualPetContainer` already
 *     has this exact safety wrapper (`handleCloseVirtualPet` awaiting
 *     `releaseLandscapeMode()` before `onClose()`) — this canonical
 *     baseline adopts that behavior, per Phase 3D's explicit instruction
 *     to take Appointments' landscape/fullscreen cleanup as the stronger
 *     baseline while keeping Content Studio's own back-button visual
 *     (ROOM-view-only) unchanged.
 */
import { useEffect, useRef, useState } from 'react';
import { TiArrowBack } from 'react-icons/ti';
import type { PetRepository } from '../contracts/petRepository';
import { SharedPetProvider, useGameState } from './runtime/SharedPetRuntime';
import { PetRoom } from './internal/PetRoom';
import { GamePage } from './internal/components/GamePage';
import PetAdoptionModal from './internal/components/PetAdoptionModal';
import { RoomType, type PetAssetUrls, type ExtraGame } from './internal/types';

export type { PetAssetUrls, ExtraGame };

const LANDSCAPE_GAME_IDS = new Set<string>(['paccat', 'tetris']);

const requiresLandscapeMode = (gameId: string | null) => gameId !== null && LANDSCAPE_GAME_IDS.has(gameId);

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>;
  unlock?: () => void;
};

type FullscreenHTMLElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type WebkitFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

interface VirtualPetContentProps {
  onClose: () => void;
  extraGames?: ExtraGame[];
}

const VirtualPetContent: React.FC<VirtualPetContentProps> = ({ onClose, extraGames }) => {
  const [view, setView] = useState<'ROOM' | 'GAME'>('ROOM');
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [showRotateNotice, setShowRotateNotice] = useState(false);
  const enteredFullscreenRef = useRef(false);
  const { setCurrentRoom } = useGameState();

  const enterLandscapeMode = async () => {
    const orientation = window.screen.orientation as LockableScreenOrientation | undefined;
    const fullscreenTarget = document.documentElement as FullscreenHTMLElement;
    const fullscreenDocument = document as WebkitFullscreenDocument;

    try {
      if (!document.fullscreenElement && !fullscreenDocument.webkitFullscreenElement) {
        if (fullscreenTarget.requestFullscreen) {
          await fullscreenTarget.requestFullscreen({ navigationUI: 'hide' });
          enteredFullscreenRef.current = true;
        } else if (fullscreenTarget.webkitRequestFullscreen) {
          await Promise.resolve(fullscreenTarget.webkitRequestFullscreen());
          enteredFullscreenRef.current = true;
        }
      }
    } catch (error) {
      console.warn('[Landscape Game] Fullscreen mode is unavailable:', error);
    }

    try {
      if (orientation?.lock) {
        await orientation.lock('landscape');
      }
    } catch (error) {
      console.warn('[Landscape Game] Orientation lock is unavailable:', error);
    }
  };

  const releaseLandscapeMode = async () => {
    const orientation = window.screen.orientation as LockableScreenOrientation | undefined;
    const fullscreenDocument = document as WebkitFullscreenDocument;

    try {
      orientation?.unlock?.();
    } catch (error) {
      console.warn('[Landscape Game] Could not unlock screen orientation:', error);
    }

    try {
      if (enteredFullscreenRef.current) {
        if (document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (fullscreenDocument.webkitFullscreenElement && fullscreenDocument.webkitExitFullscreen) {
          await Promise.resolve(fullscreenDocument.webkitExitFullscreen());
        }
      }
    } catch (error) {
      console.warn('[Landscape Game] Could not exit fullscreen mode:', error);
    }

    enteredFullscreenRef.current = false;
  };

  const handleNavigateToGame = async (gameId: string) => {
    if (requiresLandscapeMode(gameId)) {
      await enterLandscapeMode();
    }

    setActiveGameId(gameId);
    setView('GAME');
  };

  const handleCloseGame = async () => {
    const shouldReleaseLandscape = requiresLandscapeMode(activeGameId);

    setActiveGameId(null);
    setView('ROOM');
    setCurrentRoom(RoomType.GAMES);
    setShowRotateNotice(false);

    if (shouldReleaseLandscape) {
      await releaseLandscapeMode();
    }
  };

  // Adopted from Appointments' `handleCloseVirtualPet` — always release
  // landscape/fullscreen state before the host's onClose fires, whether
  // the pet is closed from the room's back button or from an active
  // landscape game (a case Content Studio's own back-button-only release
  // never covered).
  const handleClose = async () => {
    if (requiresLandscapeMode(activeGameId)) {
      await releaseLandscapeMode();
    }
    onClose();
  };

  useEffect(() => {
    if (view !== 'GAME' || !requiresLandscapeMode(activeGameId)) {
      setShowRotateNotice(false);
      return;
    }

    const updateOrientationNotice = () => {
      setShowRotateNotice(window.innerHeight > window.innerWidth);
    };

    updateOrientationNotice();

    window.addEventListener('resize', updateOrientationNotice);
    window.screen.orientation?.addEventListener('change', updateOrientationNotice);

    return () => {
      window.removeEventListener('resize', updateOrientationNotice);
      window.screen.orientation?.removeEventListener('change', updateOrientationNotice);
    };
  }, [view, activeGameId]);

  return (
    <div className="relative w-full h-full overflow-hidden pet-interface">
      {/* Back button for the pet room only */}
      {view === 'ROOM' && (
        <button
          type="button"
          onClick={handleClose}
          className="absolute left-3 top-3 z-[70] flex h-11 w-11 items-center justify-center rounded-xl border border-white/60 bg-white/75 text-slate-700 shadow-xl shadow-slate-900/10 backdrop-blur-md transition-all hover:-translate-x-0.5 hover:scale-105 hover:bg-white active:scale-95 sm:left-6 sm:top-6 sm:h-16 sm:w-16 sm:rounded-2xl"
          title="Back"
          aria-label="Back"
        >
          <TiArrowBack className="h-8 w-8 sm:h-12 sm:w-12" strokeWidth={0} />
        </button>
      )}

      {view === 'ROOM' ? (
        <PetRoom onNavigateToGame={handleNavigateToGame} extraGames={extraGames} />
      ) : (
        <>
          <GamePage gameId={activeGameId || ''} onClose={handleCloseGame} />

          {requiresLandscapeMode(activeGameId) && showRotateNotice && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 px-6 text-white">
              <div className="max-w-sm text-center">
                <div className="mb-4 text-6xl">📱↻</div>

                <h2 className="text-xl font-bold">Rotate your device</h2>

                <p className="mt-2 text-sm text-white/75">
                  {activeGameId === 'tetris' ? 'Tetris' : 'PAC-CAT'} is designed for landscape mode. Please rotate your phone to continue.
                </p>

                <button
                  type="button"
                  onClick={handleCloseGame}
                  className="mt-6 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/20"
                >
                  Back to games
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <PetAdoptionModal />
    </div>
  );
};

export interface SharedVirtualPetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Host-local database adapter — see `PetRepository`'s own doc for why
   *  this package never ships a default implementation. */
  repository: PetRepository;
  /** Opaque host-local authenticated owner ID (e.g. Content Studio's own
   *  Supabase auth uuid), or `null` when not logged in. Threaded straight
   *  through to `repository` calls, never parsed or reinterpreted — see
   *  `PetSaveSnapshot.globalUserId`'s doc in `contracts/pet.ts` for why
   *  this is intentionally NOT a future cross-app `globalUserId`. When
   *  `null`, no repository calls are made and no Pet state is persisted
   *  to localStorage either — the Pet runs in fully ephemeral,
   *  in-memory-only guest mode for that page load. */
  userId: string | null;
  /** Host-resolved currency code (e.g. from IP geolocation) — resolving
   *  this is host-specific/Supabase-coupled and stays entirely in the
   *  host's own composition wrapper. Defaults to `'USD'`. */
  currencyCode?: string;
  /** Optional host override for this package's file-backed static
   *  assets (pet spritesheets, beds, bathroom-care images). Omitted
   *  entirely reproduces exact 0.5.0 behavior. */
  assetUrls?: PetAssetUrls;
  /** Host-local games (e.g. one that predates this package, or isn't
   *  part of its shared catalog) rendered as additional cards in the
   *  Games selector, after the 3 built-in games. This package never
   *  renders, persists, or knows anything about the game itself — only
   *  the card's label/thumbnail, and it calls `onSelect` on click. See
   *  `ExtraGame`'s own doc. Omitted entirely reproduces exact 0.9.4
   *  behavior (only the 3 built-in games shown). */
  extraGames?: ExtraGame[];
}

/**
 * Real Virtual Pet presentation + runtime entry point.
 *
 * Takes `repository`/`userId` as direct props rather than pulling them
 * from `<MolarExperienceProvider>`'s config context — confirmed, by
 * inspecting Content Studio's actual `PetAssistantLayer.tsx`/
 * `CatMascot.jsx`/`MolarAIFloat.jsx`, that this host never mounts that
 * provider at all: `SharedCatMascot` and `SharedMolarAI` are both already
 * pure prop-driven components in real usage there. Matching that real,
 * already-adopted pattern here (instead of the config-context shape a
 * Phase 2 skeleton assumed before this phase's code was written) avoids
 * requiring a host to introduce a provider it doesn't otherwise need.
 */
export function SharedVirtualPet({ isOpen, onClose, repository, userId, currencyCode, assetUrls, extraGames }: SharedVirtualPetProps) {
  useEffect(() => {
    const root = document.documentElement;
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      root.style.scrollbarGutter = 'auto';
    } else {
      document.body.style.overflow = 'auto';
      root.style.scrollbarGutter = '';
    }
    return () => {
      document.body.style.overflow = 'auto';
      root.style.scrollbarGutter = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="snabbb-molar-experience">
    <div className="fixed left-0 top-0 z-[1000] h-dvh w-screen bg-black animate-in fade-in duration-200">
      <div className="w-full h-full relative">
        <SharedPetProvider repository={repository} userId={userId} currencyCode={currencyCode} assetUrls={assetUrls}>
          <VirtualPetContent onClose={onClose} extraGames={extraGames} />
        </SharedPetProvider>
      </div>
    </div>
    </div>
  );
}
