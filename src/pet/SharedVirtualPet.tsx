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
import { useCallback, useEffect, useRef, useState } from 'react';
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

const PixelMapIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" shapeRendering="crispEdges">
    <path fill="#f6c453" d="M2 4h6v16H2zM9 2h6v16H9zM16 4h6v16h-6z" />
    <path fill="#fff1a8" d="M4 6h2v4H4zM11 4h2v5h-2zM18 6h2v4h-2z" />
    <path fill="#8b5a2b" d="M2 3h6v2H2zM8 2h2v17H8zM14 2h2v17h-2zM16 19h6v2h-6zM2 19h6v2H2zM16 3h6v2h-6z" />
    <path fill="#ef5b5b" d="M11 11h3v3h-1v3h-1v-3h-1z" />
  </svg>
);

const PixelRoomIcon = ({ room, className = '' }: { room: RoomType; className?: string }) => {
  const common = { className, 'aria-hidden': true, shapeRendering: 'crispEdges' as const, viewBox: '0 0 24 24' };

  if (room === RoomType.KITCHEN) return <svg {...common}><path fill="#f59e0b" d="M3 3h7v8H8v10H5V11H3zM14 3h3v7h2v11h-3V10h-2z" /><path fill="#fff7d6" d="M5 3h1v6H5zM8 3h1v6H8z" /></svg>;
  if (room === RoomType.BATHROOM) return <svg {...common}><path fill="#22b8cf" d="M3 9h18v9H3zM5 18h3v3H5zM16 18h3v3h-3zM5 5h3v4H5zM7 3h6v3H7z" /><path fill="#dffbff" d="M5 11h14v3H5z" /></svg>;
  if (room === RoomType.PLAYROOM) return <svg {...common}><path fill="#65a30d" d="M10 2h4v4h4v4h3v5h-7v7h-4v-7H3v-5h3V6h4z" /><path fill="#a3e635" d="M8 7h3v3H8zM14 8h3v3h-3z" /><path fill="#854d0e" d="M10 15h4v7h-4z" /></svg>;
  if (room === RoomType.BEDROOM) return <svg {...common}><path fill="#6366f1" d="M3 5h3v14H3zM6 9h15v10H6zM8 6h6v5H8zM3 18h19v3H3z" /><path fill="#eef2ff" d="M9 7h4v3H9z" /></svg>;
  return <svg {...common}><path fill="#8b5cf6" d="M5 7h14v3h3v8h-5v-3H7v3H2v-8h3z" /><path fill="#fff" d="M7 10h2v2h2v2H9v2H7v-2H5v-2h2zM16 11h2v2h-2zM18 13h2v2h-2z" /></svg>;
};

interface VirtualPetContentProps {
  onClose: () => void;
  extraGames?: ExtraGame[];
  gameProgressClient?: GameProgressClient;
  userId: string | null;
}

export interface GameProgressClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: any; error: { message?: string } | null }>;
}

const VirtualPetContent: React.FC<VirtualPetContentProps> = ({ onClose, extraGames, gameProgressClient, userId }) => {
  const [view, setView] = useState<'ROOM' | 'GAME'>('ROOM');
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [showRotateNotice, setShowRotateNotice] = useState(false);
  const [showRoomMap, setShowRoomMap] = useState(false);
  const [isRoomLoading, setIsRoomLoading] = useState(false);
  const handleRoomLoadingChange = useCallback((loading: boolean) => {
    setIsRoomLoading(loading);
    if (loading) setShowRoomMap(false);
  }, []);
  const [roomNavigationRequest, setRoomNavigationRequest] = useState<{ destination: RoomType; requestId: number } | null>(null);
  const enteredFullscreenRef = useRef(false);
  const { currentRoom, setCurrentRoom } = useGameState();

  const roomMapItems = [
    { room: RoomType.KITCHEN, label: 'Kitchen', colors: 'border-orange-700 bg-orange-100 text-orange-800' },
    { room: RoomType.BATHROOM, label: 'Bathroom', colors: 'border-cyan-700 bg-cyan-100 text-cyan-800' },
    { room: RoomType.PLAYROOM, label: 'Outside', colors: 'border-lime-700 bg-lime-100 text-lime-800' },
    { room: RoomType.BEDROOM, label: 'Bedroom', colors: 'border-indigo-700 bg-indigo-100 text-indigo-800' },
    { room: RoomType.GAMES, label: 'Games', colors: 'border-violet-700 bg-violet-100 text-violet-800' },
  ];

  const handleRoomMapNavigate = (room: RoomType) => {
    if (isRoomLoading || roomNavigationRequest) return;
    setShowRoomMap(false);
    if (room === currentRoom) return;
    setRoomNavigationRequest({ destination: room, requestId: Date.now() });
  };

  const handleRoomNavigationRequestHandled = useCallback(() => {
    setRoomNavigationRequest(null);
  }, []);

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
        <>
          <button
            type="button"
            onClick={handleClose}
            className="absolute left-3 top-3 z-[70] flex h-11 w-11 items-center justify-center rounded-md border-2 border-stone-500 bg-[#fff8d9] text-slate-700 shadow-[3px_3px_0_rgba(69,56,35,0.45)] transition-transform hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none sm:left-6 sm:top-6 sm:h-16 sm:w-16"
            title="Back"
            aria-label="Back"
          >
            <TiArrowBack className="h-8 w-8 sm:h-12 sm:w-12" strokeWidth={0} />
          </button>

          <button
            type="button"
            onClick={() => setShowRoomMap((visible) => !visible)}
            disabled={isRoomLoading || !!roomNavigationRequest}
            className={`absolute left-16 top-3 z-[70] flex h-11 w-11 items-center justify-center rounded-md border-2 shadow-[3px_3px_0_rgba(69,56,35,0.45)] transition-transform hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none sm:left-[6.25rem] sm:top-6 sm:h-16 sm:w-16 ${showRoomMap ? 'border-amber-800 bg-amber-200' : 'border-stone-500 bg-[#fff8d9]'}`}
            title="Open map"
            aria-label="Choose a room"
            aria-expanded={showRoomMap}
          >
            <PixelMapIcon className="h-7 w-7 sm:h-11 sm:w-11" />
          </button>

          {showRoomMap && !isRoomLoading && !roomNavigationRequest && (
            <>
              <button type="button" className="fixed inset-0 z-[64] cursor-default" onClick={() => setShowRoomMap(false)} aria-label="Close map" />
              <div className="absolute left-3 top-[4.25rem] z-[70] w-[min(19rem,calc(100vw-1.5rem))] border-4 border-[#6b4423] bg-[#fff3bd] p-2 shadow-[6px_6px_0_rgba(51,35,20,0.55)] sm:left-6 sm:top-[6.25rem] sm:w-80 sm:p-3">
                <div className="mb-2 flex items-center gap-2 border-b-4 border-dashed border-[#b77935] px-1 pb-2 text-[#5c3a1e]">
                  <PixelMapIcon className="h-6 w-6" />
                  <span className="text-sm font-black uppercase tracking-[0.12em]">Choose a place</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {roomMapItems.map(({ room, label, colors }) => {
                    const isActive = currentRoom === room;
                    return (
                      <button
                        key={room}
                        type="button"
                        onClick={() => handleRoomMapNavigate(room)}
                        className={`relative flex min-h-20 flex-col items-center justify-center gap-1 border-2 p-2 font-black uppercase shadow-[3px_3px_0_rgba(82,55,30,0.35)] transition-transform hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none sm:min-h-24 ${isActive ? colors : 'border-[#9a6b3f] bg-[#fffaf0] text-[#5c3a1e]'}`}
                        aria-current={isActive ? 'location' : undefined}
                      >
                        {isActive && <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center bg-emerald-500 text-[10px] leading-none text-white">✓</span>}
                        <PixelRoomIcon room={room} className="h-8 w-8 sm:h-10 sm:w-10" />
                        <span className="text-[9px] tracking-[0.08em] sm:text-[11px]">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {view === 'ROOM' ? (
        <PetRoom
          onNavigateToGame={handleNavigateToGame}
          extraGames={extraGames}
          roomNavigationRequest={roomNavigationRequest}
          onRoomNavigationRequestHandled={handleRoomNavigationRequestHandled}
          onLoadingChange={handleRoomLoadingChange}
        />
      ) : (
        <>
          <GamePage
            gameId={activeGameId || ''}
            onClose={handleCloseGame}
            gameProgressClient={gameProgressClient}
            userId={userId}
          />

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
  /** Authenticated database client used by the built-in games to keep
   * progress identical across every Snabbb origin. */
  gameProgressClient?: GameProgressClient;
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
export function SharedVirtualPet({ isOpen, onClose, repository, userId, currencyCode, assetUrls, extraGames, gameProgressClient }: SharedVirtualPetProps) {
  useEffect(() => {
    if (!isOpen) return;

    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousRootOverscrollBehavior = root.style.overscrollBehavior;
    const previousRootHeight = root.style.height;
    const previousRootScrollbarGutter = root.style.scrollbarGutter;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior;
    const previousBodyHeight = body.style.height;

    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';
    root.style.height = '100%';
    root.style.scrollbarGutter = 'auto';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    body.style.height = '100%';

    return () => {
      root.style.overflow = previousRootOverflow;
      root.style.overscrollBehavior = previousRootOverscrollBehavior;
      root.style.height = previousRootHeight;
      root.style.scrollbarGutter = previousRootScrollbarGutter;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      body.style.height = previousBodyHeight;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="snabbb-molar-experience" data-molar-theme="light">
    <div className="fixed inset-0 z-[1000] h-dvh w-screen overflow-hidden overscroll-none bg-black animate-in fade-in duration-200">
      <div className="w-full h-full relative">
        <SharedPetProvider key={userId ?? 'guest'} repository={repository} userId={userId} currencyCode={currencyCode} assetUrls={assetUrls}>
          <VirtualPetContent onClose={onClose} extraGames={extraGames} gameProgressClient={gameProgressClient} userId={userId} />
        </SharedPetProvider>
      </div>
    </div>
    </div>
  );
}
