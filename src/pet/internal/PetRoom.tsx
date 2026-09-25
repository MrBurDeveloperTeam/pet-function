/**
 * Ported verbatim from Content Studio's `src/VirtualPet/PetRoom.tsx`, with:
 *   - `useGameState` now imported from this package's shared pet runtime
 *   - the poop icon now a bundled package asset instead of `/images/poop.png`
 * Every constant, decay/reward number, drag/physics/soap/bathroom mechanic,
 * and layout is otherwise unchanged.
 */
import React, { useState, useEffect, useRef } from 'react';
import { RoomType, FoodItem, Bubble, ToolType, ExtraGame } from './types';
import { ROOM_THEMES, TOY_ITEMS } from './constants';
import Pet, { PetPose } from './components/Pet';
import StatsBar from './components/StatsBar';
import BottomControls from './components/BottomControls';
import { FoodMenu, BathroomMenu, GamesMenu } from './components/RoomMenus';
import DragLayer from './components/DragLayer';
import Ball from './components/Ball';
import ShopModal from './components/ShopModal';
import { useGameState, getPetStorageKey } from '../runtime/SharedPetRuntime';
import { useBallPhysics } from './hooks/useBallPhysics';
import LevelIndicator from './components/LevelIndicator';
import CoinIndicator from './components/CoinIndicator';
import { getPetOption } from './petOptions';
import poopUrl from '../../assets/pet/poop.png';
import { ROOM_BACKGROUNDS } from './roomBackgrounds';

type RoomExitDirection = 'left' | 'right' | 'down';

interface RoomExit {
  direction: RoomExitDirection;
  destination: RoomType;
  label: string;
}

const ROOM_EXITS: Partial<Record<RoomType, RoomExit[]>> = {
  [RoomType.GAMES]: [
    { direction: 'right', destination: RoomType.BEDROOM, label: 'Go to bedroom' },
    { direction: 'right', destination: RoomType.KITCHEN, label: 'Go to kitchen' },
  ],
  [RoomType.BEDROOM]: [
    { direction: 'left', destination: RoomType.GAMES, label: 'Go to games room' },
    { direction: 'right', destination: RoomType.BATHROOM, label: 'Go to bathroom' },
  ],
  [RoomType.BATHROOM]: [
    { direction: 'left', destination: RoomType.BEDROOM, label: 'Go to bedroom' },
  ],
  [RoomType.KITCHEN]: [
    { direction: 'left', destination: RoomType.GAMES, label: 'Go to games room' },
    { direction: 'right', destination: RoomType.PLAYROOM, label: 'Go outside' },
  ],
  [RoomType.PLAYROOM]: [
    { direction: 'left', destination: RoomType.GAMES, label: 'Go to games room' },
  ],
};

const PixelSceneArrow = ({ direction }: { direction: RoomExitDirection }) => {
  const rotation = direction === 'left' ? 'rotate(180 12 12)' : direction === 'down' ? 'rotate(90 12 12)' : undefined;

  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 sm:h-9 sm:w-9" aria-hidden="true" shapeRendering="crispEdges">
      <g transform={rotation}>
        <path fill="#55351f" d="M3 9h10V4h4v3h2v2h2v6h-2v2h-2v3h-4v-5H3z" />
        <path fill="#fff0a8" d="M5 11h11V8h2v2h2v4h-2v2h-2v-3H5z" />
      </g>
    </svg>
  );
};

const PixelPaw = () => (
  <svg viewBox="0 0 20 18" className="h-5 w-5" aria-hidden="true" shapeRendering="crispEdges">
    <path fill="currentColor" d="M6 1h3v4H6zM12 1h3v4h-3zM2 5h3v4H2zM16 5h3v4h-3zM6 7h9v3h2v5h-3v2H7v-2H4v-5h2z" />
  </svg>
);

const MAX_BUBBLES = 120;
const RINSE_COMPLETE_THRESHOLD = Math.ceil(MAX_BUBBLES * 0.05);
const POOP_REWARD_COINS = 5;
const POOP_RESPAWN_MS = 2 * 60 * 60 * 1000;
const POOP_NEXT_SPAWN_KEY = 'virtual_pet_next_poop_at';
const OUTSIDE_PET_SCALE = 0.75;
const INDOOR_PET_SCALE = 0.72;
const BEDROOM_PET_SCALE_MULTIPLIER = 0.8;
const INDOOR_PET_OFFSET_Y = 32;
const INDOOR_PET_KEYBOARD_SPEED = 360;
const INDOOR_PET_MOUSE_SPEED = 520;
const INDOOR_PET_STOP_DISTANCE = 2;
const ROOM_TRANSITION_LOADING_MS = 1800;

const INDOOR_FLOOR_LANES: Partial<Record<RoomType, { min: number; max: number }>> = {
  [RoomType.KITCHEN]: { min: 0.14, max: 0.86 },
  [RoomType.BATHROOM]: { min: 0.16, max: 0.84 },
  [RoomType.BEDROOM]: { min: 0.18, max: 0.82 },
  [RoomType.GAMES]: { min: 0.12, max: 0.88 },
  [RoomType.GARDEN]: { min: 0.12, max: 0.88 },
};

const INDOOR_FLOOR_DEPTH: Partial<Record<RoomType, { min: number; max: number }>> = {
  [RoomType.KITCHEN]: { min: -0.08, max: 0.16 },
  [RoomType.BATHROOM]: { min: -0.06, max: 0.22 },
  [RoomType.BEDROOM]: { min: -0.05, max: 0.12 },
  [RoomType.GAMES]: { min: -0.07, max: 0.16 },
};

const INDOOR_INITIAL_PLACEMENT: Partial<Record<RoomType, { x: number; y: number }>> = {
  [RoomType.KITCHEN]: { x: 0.48, y: 0.06 },
  [RoomType.BATHROOM]: { x: 0.48, y: 0.2 },
  [RoomType.BEDROOM]: { x: 0.5, y: -0.04 },
  [RoomType.GAMES]: { x: 0.48, y: 0.06 },
};

const BEDROOM_SCENE_WIDTH = 560;
const BEDROOM_SCENE_HEIGHT = 430;
const BEDROOM_BED_BOTTOM_OFFSET = 96;

const SLEEP_WAKE_DURATION_MS = 760;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const getRoomSceneHorizontalBounds = (width: number, _height: number) => ({
  sceneLeft: 0,
  sceneWidth: width,
});

interface PetRoomProps {
  onNavigateToGame: (gameId: string) => void;
  /** Host-local games rendered as additional Games-menu cards. See
   *  `ExtraGame`'s own doc (types.ts). */
  extraGames?: ExtraGame[];
  roomNavigationRequest?: { destination: RoomType; requestId: number } | null;
  onRoomNavigationRequestHandled?: () => void;
}

export const PetRoom: React.FC<PetRoomProps> = ({
  onNavigateToGame,
  extraGames,
  roomNavigationRequest,
  onRoomNavigationRequestHandled,
}) => {
  // --- Custom Hooks for Logic ---
  const {
    userId,
    stats, setStats,
    petName,
    currentRoom, setCurrentRoom,
    isSleeping, setIsSleeping,
    isEating, setIsEating,
    isPlaying, setIsPlaying,
    inventory, buyItem, consumeItem,
    addXP, addCoins, activeBallId, setActiveBallId, activeBedId, setActiveBedId,
    foodItems, isFoodLoading, currencyRate, assetUrls
  } = useGameState();
  // PERSIST-4: the poop-spawn timer is account-sensitive Pet room state
  // (it gates the `POOP_REWARD_COINS` earn mechanic), so it goes through
  // the same `getPetStorageKey` scoping as every other Pet cache key —
  // see that helper's own doc comment in SharedPetRuntime.tsx.
  const poopNextSpawnKey = getPetStorageKey(userId, POOP_NEXT_SPAWN_KEY);
  const activePet = getPetOption(petName, assetUrls?.spriteSheets);

  const {
    ballPos, setBallPos,
    isDraggingBall, setIsDraggingBall,
    isBallMoving,
    ballVel, lastDragPos
  } = useBallPhysics(currentRoom);

  useEffect(() => {
    if (currentRoom === RoomType.PLAYROOM) {
      // Reset ball to bottom center when entering playroom
      setBallPos({
        x: window.innerWidth / 2,
        y: window.innerHeight - 100 // 100px from bottom
      });
      ballVel.current = { vx: 0, vy: 0 };
    }
  }, [currentRoom, setBallPos]);

  // --- Local UI State ---
  const [showFoodMenu, setShowFoodMenu] = useState(false);
  const [showBathroomMenu, setShowBathroomMenu] = useState(false);
  const [showShopModal, setShowShopModal] = useState(false);
  const [showGamesMenu, setShowGamesMenu] = useState(false);
  const [isPoopVisible, setIsPoopVisible] = useState(false);
  const [showPoopReward, setShowPoopReward] = useState(false);
  const [bedroomSceneScale, setBedroomSceneScale] = useState(1);


  // Drag & Drop / Tool State
  const [draggedItem, setDraggedItem] = useState<FoodItem | null>(null);
  const [draggedTool, setDraggedTool] = useState<ToolType | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [isHoveringPet, setIsHoveringPet] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [isSoapedUp, setIsSoapedUp] = useState(false);
  const [outsidePetPos, setOutsidePetPos] = useState({ x: 0, y: 0 });
  const [outsidePetPose, setOutsidePetPose] = useState<PetPose>('idle');
  const [indoorPetX, setIndoorPetX] = useState(0);
  const [indoorPetYOffset, setIndoorPetYOffset] = useState(0);
  const [indoorPetPose, setIndoorPetPose] = useState<PetPose>('idle');
  const [roomTransition, setRoomTransition] = useState<RoomExit | null>(null);
  const [isRoomTransitionLoading, setIsRoomTransitionLoading] = useState(false);
  const [loadingAnimationKey, setLoadingAnimationKey] = useState(0);

  // Pointer/Eye Tracking State
  const [pointerState, setPointerState] = useState<{ isDown: boolean, x: number, y: number }>({ isDown: false, x: 0, y: 0 });

  const playAreaRef = useRef<HTMLDivElement>(null);
  const roomRootRef = useRef<HTMLDivElement>(null);
  const petRef = useRef<HTMLDivElement>(null);
  const lastBubbleTime = useRef(0);
  const lastBallPlayTime = useRef(0);
  const ballPlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outsidePetPosRef = useRef(outsidePetPos);
  const outsidePetRaf = useRef<number>(0);
  const outsidePointerTargetRef = useRef<{ x: number; y: number } | null>(null);
  const outsideMovementKeysRef = useRef({ left: false, right: false, up: false, down: false });
  const indoorPetXRef = useRef(indoorPetX);
  const indoorPetYOffsetRef = useRef(indoorPetYOffset);
  const indoorPetTargetXRef = useRef<number | null>(null);
  const indoorPetRaf = useRef<number>(0);
  const indoorMovementKeysRef = useRef({ left: false, right: false, up: false, down: false });
  const ballPosRef = useRef(ballPos);
  const outsideBallTargetRef = useRef<{ x: number; y: number } | null>(null);
  const outsideWakeUntilRef = useRef(0);
  const isBallMovingRef = useRef(isBallMoving);
  const isDraggingBallRef = useRef(isDraggingBall);
  const activeSoapType = useRef<'soap' | null>(null);
  const soapConsumedOnRinse = useRef(false);
  const activeSoapMultiplier = useRef(1);

  useEffect(() => {
    if (currentRoom !== RoomType.BEDROOM) {
      setBedroomSceneScale(1);
      return;
    }

    const playArea = playAreaRef.current;
    if (!playArea) return;

    const updateBedroomSceneScale = () => {
      const rect = playArea.getBoundingClientRect();
      const horizontalPadding = rect.width < 480 ? 16 : 32;
      const topUiClearance = clamp(rect.height * 0.2, 100, 160);
      const bottomClearance = 16;

      const availableWidth = Math.max(
        rect.width - horizontalPadding,
        1
      );

      const availableHeight = Math.max(
        rect.height - topUiClearance - bottomClearance,
        1
      );

      const sceneFootprintHeight =
        BEDROOM_SCENE_HEIGHT +
        BEDROOM_BED_BOTTOM_OFFSET;

      const nextScale = clamp(
        Math.min(
          availableWidth / BEDROOM_SCENE_WIDTH,
          availableHeight / sceneFootprintHeight
        ),
        0.24,
        1
      );

      setBedroomSceneScale(nextScale);
    };

    updateBedroomSceneScale();

    const resizeObserver =
      new ResizeObserver(updateBedroomSceneScale);

    resizeObserver.observe(playArea);

    window.addEventListener(
      'resize',
      updateBedroomSceneScale
    );

    window.visualViewport?.addEventListener(
      'resize',
      updateBedroomSceneScale
    );

    return () => {
      resizeObserver.disconnect();

      window.removeEventListener(
        'resize',
        updateBedroomSceneScale
      );

      window.visualViewport?.removeEventListener(
        'resize',
        updateBedroomSceneScale
      );
    };
  }, [currentRoom]);

  useEffect(() => {
    outsidePetPosRef.current = outsidePetPos;
  }, [outsidePetPos]);

  useEffect(() => {
    indoorPetXRef.current = indoorPetX;
  }, [indoorPetX]);

  useEffect(() => {
    indoorPetYOffsetRef.current = indoorPetYOffset;
  }, [indoorPetYOffset]);

  useEffect(() => {
    ballPosRef.current = ballPos;
  }, [ballPos]);

  useEffect(() => {
    isBallMovingRef.current = isBallMoving;
  }, [isBallMoving]);

  useEffect(() => {
    isDraggingBallRef.current = isDraggingBall;
  }, [isDraggingBall]);

  const getSoapItem = () => foodItems.find((item) => item.id === 'soap' && item.category === 'Soap');

  useEffect(() => {
    if (activeBedId !== null) setActiveBedId(null);
  }, [activeBedId, setActiveBedId]);

  useEffect(() => {
    if (currentRoom !== RoomType.PLAYROOM || !playAreaRef.current) return;

    const rect = playAreaRef.current.getBoundingClientRect();
    const initialPos = {
      x: rect.width / 2,
      y: Math.max(190, rect.height / 2),
    };
    outsidePetPosRef.current = initialPos;
    setOutsidePetPos(initialPos);
    setOutsidePetPose('idle');
  }, [currentRoom]);

  useEffect(() => {
    if (currentRoom !== RoomType.GAMES) setShowGamesMenu(false);
  }, [currentRoom]);

  const getIndoorPetBounds = () => {
    const area = playAreaRef.current;
    const lane = INDOOR_FLOOR_LANES[currentRoom];
    if (!area || !lane) return null;

    const rect = area.getBoundingClientRect();
    const roomRect = roomRootRef.current?.getBoundingClientRect() || rect;
    const { sceneLeft, sceneWidth } = getRoomSceneHorizontalBounds(roomRect.width, roomRect.height);
    const displayScale = currentRoom === RoomType.BEDROOM
      ? bedroomSceneScale * BEDROOM_PET_SCALE_MULTIPLIER
      : INDOOR_PET_SCALE;
    const petHalfWidth = (192 * displayScale) / 2;
    const visualMin = Math.max(sceneLeft + petHalfWidth, sceneLeft + sceneWidth * lane.min);
    const visualMax = Math.min(sceneLeft + sceneWidth - petHalfWidth, sceneLeft + sceneWidth * lane.max);

    return {
      min: Math.min(visualMin, visualMax),
      max: Math.max(visualMin, visualMax),
      rect,
    };
  };

  const getIndoorPetVerticalBounds = () => {
    const area = playAreaRef.current;
    const depth = INDOOR_FLOOR_DEPTH[currentRoom];
    if (!area || !depth) return null;

    const rect = area.getBoundingClientRect();
    return {
      min: rect.height * depth.min,
      max: rect.height * depth.max,
    };
  };

  const startRoomTransition = (exit: RoomExit) => {
    if (roomTransition || isRoomTransitionLoading) return;

    if (currentRoom === RoomType.PLAYROOM) {
      const area = playAreaRef.current;
      if (!area) {
        setCurrentRoom(exit.destination);
        return;
      }

      const rect = area.getBoundingClientRect();
      const roomRect = roomRootRef.current?.getBoundingClientRect() || rect;
      const { sceneLeft, sceneWidth } = getRoomSceneHorizontalBounds(roomRect.width, roomRect.height);
      const petHalfWidth = (192 * OUTSIDE_PET_SCALE) / 2;
      outsideMovementKeysRef.current = { left: false, right: false, up: false, down: false };
      outsideBallTargetRef.current = null;
      outsidePointerTargetRef.current = {
        x: exit.direction === 'left'
          ? sceneLeft + petHalfWidth
          : sceneLeft + sceneWidth - petHalfWidth,
        y: outsidePetPosRef.current.y,
      };
      setRoomTransition(exit);
      return;
    }

    const bounds = getIndoorPetBounds();
    if (!bounds || exit.direction === 'down') {
      setCurrentRoom(exit.destination);
      return;
    }

    indoorMovementKeysRef.current = { left: false, right: false, up: false, down: false };
    indoorPetTargetXRef.current = exit.direction === 'left' ? bounds.min : bounds.max;
    setRoomTransition(exit);
  };

  useEffect(() => {
    if (!roomNavigationRequest || roomTransition || isRoomTransitionLoading) return;

    if (roomNavigationRequest.destination === currentRoom) {
      onRoomNavigationRequestHandled?.();
      return;
    }

    setShowFoodMenu(false);
    setShowBathroomMenu(false);
    setShowGamesMenu(false);
    setShowShopModal(false);
    setRoomTransition({
      direction: 'down',
      destination: roomNavigationRequest.destination,
      label: 'Travel from map',
    });
    setLoadingAnimationKey((key) => key + 1);
    setIsRoomTransitionLoading(true);
  }, [
    currentRoom,
    isRoomTransitionLoading,
    onRoomNavigationRequestHandled,
    roomNavigationRequest,
    roomTransition,
  ]);

  useEffect(() => {
    if (!roomTransition || isRoomTransitionLoading || roomTransition.direction === 'down') return;

    const bounds = getIndoorPetBounds();
    if (!bounds) return;
    const destinationX = roomTransition.direction === 'left' ? bounds.min : bounds.max;
    if (Math.abs(indoorPetX - destinationX) > INDOOR_PET_STOP_DISTANCE + 1) return;

    setLoadingAnimationKey((key) => key + 1);
    setIsRoomTransitionLoading(true);
    setIndoorPetPose('idle');
  }, [bedroomSceneScale, indoorPetX, isRoomTransitionLoading, roomTransition]);

  useEffect(() => {
    if (currentRoom !== RoomType.PLAYROOM || !roomTransition || isRoomTransitionLoading) return;

    const target = outsidePointerTargetRef.current;
    if (!target || Math.abs(outsidePetPos.x - target.x) > INDOOR_PET_STOP_DISTANCE + 1) return;

    outsidePointerTargetRef.current = null;
    setLoadingAnimationKey((key) => key + 1);
    setIsRoomTransitionLoading(true);
    setOutsidePetPose('idle');
  }, [currentRoom, isRoomTransitionLoading, outsidePetPos.x, roomTransition]);

  useEffect(() => {
    if (!roomTransition || !isRoomTransitionLoading) return;

    const timer = window.setTimeout(() => {
      setCurrentRoom(roomTransition.destination);
      setRoomTransition(null);
      setIsRoomTransitionLoading(false);
      onRoomNavigationRequestHandled?.();
    }, ROOM_TRANSITION_LOADING_MS);

    return () => window.clearTimeout(timer);
  }, [isRoomTransitionLoading, onRoomNavigationRequestHandled, roomTransition, setCurrentRoom]);

  useEffect(() => {
    if (currentRoom === RoomType.PLAYROOM) return;

    const area = playAreaRef.current;
    if (!area) return;

    const resetIndoorPosition = () => {
      const bounds = getIndoorPetBounds();
      if (!bounds) return;
      const placement = INDOOR_INITIAL_PLACEMENT[currentRoom] || { x: 0.5, y: 0 };
      const verticalBounds = getIndoorPetVerticalBounds();
      const nextX = clamp(bounds.rect.width * placement.x, bounds.min, bounds.max);
      const nextYOffset = verticalBounds
        ? clamp(bounds.rect.height * placement.y, verticalBounds.min, verticalBounds.max)
        : 0;
      indoorPetXRef.current = nextX;
      indoorPetYOffsetRef.current = nextYOffset;
      indoorPetTargetXRef.current = null;
      setIndoorPetX(nextX);
      setIndoorPetYOffset(nextYOffset);
      setIndoorPetPose('idle');
    };

    resetIndoorPosition();
    const resizeObserver = new ResizeObserver(() => {
      const bounds = getIndoorPetBounds();
      if (!bounds) return;
      const nextX = clamp(indoorPetXRef.current || bounds.rect.width / 2, bounds.min, bounds.max);
      indoorPetXRef.current = nextX;
      setIndoorPetX(nextX);
    });
    resizeObserver.observe(area);

    return () => resizeObserver.disconnect();
  }, [bedroomSceneScale, currentRoom]);

  useEffect(() => {
    if (currentRoom === RoomType.PLAYROOM || showShopModal || showGamesMenu || showBathroomMenu || showFoodMenu || isSleeping) {
      indoorMovementKeysRef.current = { left: false, right: false, up: false, down: false };
      indoorPetTargetXRef.current = null;
      setIndoorPetPose('idle');
      return;
    }

    const isEditableTarget = (target: EventTarget | null) => {
      const element = target instanceof HTMLElement ? target : null;
      return !!element?.closest('input, textarea, select, [contenteditable="true"]');
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (roomTransition) return;
      if (isEditableTarget(event.target) || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      indoorPetTargetXRef.current = null;
      if (event.key === 'ArrowLeft') indoorMovementKeysRef.current.left = true;
      if (event.key === 'ArrowRight') indoorMovementKeysRef.current.right = true;
      if (event.key === 'ArrowUp') indoorMovementKeysRef.current.up = true;
      if (event.key === 'ArrowDown') indoorMovementKeysRef.current.down = true;
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') indoorMovementKeysRef.current.left = false;
      if (event.key === 'ArrowRight') indoorMovementKeysRef.current.right = false;
      if (event.key === 'ArrowUp') indoorMovementKeysRef.current.up = false;
      if (event.key === 'ArrowDown') indoorMovementKeysRef.current.down = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let lastFrameAt = performance.now();
    const tick = (frameAt: number) => {
      const bounds = getIndoorPetBounds();
      const elapsedSeconds = Math.min((frameAt - lastFrameAt) / 1000, 0.05);
      lastFrameAt = frameAt;

      if (bounds) {
        const verticalBounds = getIndoorPetVerticalBounds();
        const keys = indoorMovementKeysRef.current;
        const horizontalDirection = Number(keys.right) - Number(keys.left);
        const verticalDirection = Number(keys.down) - Number(keys.up);
        const currentX = indoorPetXRef.current || bounds.rect.width / 2;
        const currentYOffset = indoorPetYOffsetRef.current;
        let nextX = currentX;
        let nextYOffset = currentYOffset;
        let nextPose: PetPose = 'idle';

        if (horizontalDirection !== 0 || verticalDirection !== 0) {
          nextX = clamp(
            currentX + horizontalDirection * INDOOR_PET_KEYBOARD_SPEED * elapsedSeconds,
            bounds.min,
            bounds.max
          );
          if (verticalBounds) {
            nextYOffset = clamp(
              currentYOffset + verticalDirection * INDOOR_PET_KEYBOARD_SPEED * elapsedSeconds,
              verticalBounds.min,
              verticalBounds.max
            );
          }
          nextPose = horizontalDirection < 0 ? 'run-left' : 'run-right';
        } else if (indoorPetTargetXRef.current !== null) {
          const targetX = clamp(indoorPetTargetXRef.current, bounds.min, bounds.max);
          const delta = targetX - currentX;
          if (Math.abs(delta) <= INDOOR_PET_STOP_DISTANCE) {
            nextX = targetX;
            indoorPetTargetXRef.current = null;
          } else {
            const travel = Math.min(Math.abs(delta), INDOOR_PET_MOUSE_SPEED * elapsedSeconds);
            nextX = currentX + Math.sign(delta) * travel;
            nextPose = delta < 0 ? 'run-left' : 'run-right';
          }
        }

        if (nextX !== currentX) {
          indoorPetXRef.current = nextX;
          setIndoorPetX(nextX);
        }
        if (nextYOffset !== currentYOffset) {
          indoorPetYOffsetRef.current = nextYOffset;
          setIndoorPetYOffset(nextYOffset);
        }
        setIndoorPetPose((previous) => previous === nextPose ? previous : nextPose);
      }

      indoorPetRaf.current = requestAnimationFrame(tick);
    };

    indoorPetRaf.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(indoorPetRaf.current);
      indoorMovementKeysRef.current = { left: false, right: false, up: false, down: false };
    };
  }, [bedroomSceneScale, currentRoom, isSleeping, roomTransition, showBathroomMenu, showFoodMenu, showGamesMenu, showShopModal]);

  useEffect(() => {
    if (currentRoom !== RoomType.KITCHEN || showShopModal || showFoodMenu || isSleeping || roomTransition) return;

    const handleKitchenInteraction = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return;

      const area = playAreaRef.current;
      if (!area) return;
      const rect = area.getBoundingClientRect();
      const petXRatio = indoorPetXRef.current / Math.max(rect.width, 1);
      const isNearFridge = petXRatio >= 0.16 && petXRatio <= 0.33;
      if (!isNearFridge) return;

      event.preventDefault();
      setShowFoodMenu(true);
      setIndoorPetPose('idle');
    };

    window.addEventListener('keydown', handleKitchenInteraction);
    return () => window.removeEventListener('keydown', handleKitchenInteraction);
  }, [currentRoom, isSleeping, roomTransition, showFoodMenu, showShopModal]);

  useEffect(() => {
    if (currentRoom !== RoomType.BATHROOM || showShopModal || showBathroomMenu || isSleeping || roomTransition) return;

    const handleBathroomInteraction = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return;

      const area = playAreaRef.current;
      if (!area) return;
      const rect = area.getBoundingClientRect();
      const petXRatio = indoorPetXRef.current / Math.max(rect.width, 1);
      const isNearBathtub = petXRatio >= 0.24 && petXRatio <= 0.53;
      if (!isNearBathtub) return;

      event.preventDefault();
      setShowBathroomMenu(true);
      setIndoorPetPose('idle');
    };

    window.addEventListener('keydown', handleBathroomInteraction);
    return () => window.removeEventListener('keydown', handleBathroomInteraction);
  }, [currentRoom, isSleeping, roomTransition, showBathroomMenu, showShopModal]);

  useEffect(() => {
    if (currentRoom !== RoomType.GAMES || showShopModal || showGamesMenu || isSleeping || roomTransition) return;

    const handleGamesInteraction = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return;

      const area = playAreaRef.current;
      if (!area) return;
      const rect = area.getBoundingClientRect();
      const petXRatio = indoorPetXRef.current / Math.max(rect.width, 1);
      const isNearGameStation = petXRatio >= 0.28 && petXRatio <= 0.66;
      if (!isNearGameStation) return;

      event.preventDefault();
      setShowGamesMenu(true);
      setIndoorPetPose('idle');
    };

    window.addEventListener('keydown', handleGamesInteraction);
    return () => window.removeEventListener('keydown', handleGamesInteraction);
  }, [currentRoom, isSleeping, roomTransition, showGamesMenu, showShopModal]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const syncPoopVisibility = () => {
      const nextSpawnAt = Number((poopNextSpawnKey ? localStorage.getItem(poopNextSpawnKey) : null) || 0);
      const now = Date.now();

      if (!nextSpawnAt || now >= nextSpawnAt) {
        setIsPoopVisible(true);
        return;
      }

      setIsPoopVisible(false);
      timeoutId = setTimeout(syncPoopVisibility, nextSpawnAt - now);
    };

    syncPoopVisibility();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // Manage Soaped State (Hysteresis)
  useEffect(() => {
    if (bubbles.length >= MAX_BUBBLES) {
      setIsSoapedUp(true);
    } else if (bubbles.length === 0 && isSoapedUp) {
      // Add a delay before resetting soaped state to show "Clean" message
      const timer = setTimeout(() => {
        setIsSoapedUp(false);
      }, 800);
      return () => clearTimeout(timer);
    } else if (bubbles.length === 0 && !isSoapedUp) {
      // Immediate reset if not previously soaped (initial state)
      setIsSoapedUp(false);
    }
  }, [bubbles.length, isSoapedUp]);

  // --- Handlers ---
  const handleDragStartItem = (e: React.PointerEvent, item: FoodItem) => {
    e.preventDefault();
    setDraggedItem(item);
    setDragPos({ x: e.clientX, y: e.clientY });
  };

  const handleDragStartTool = (e: React.PointerEvent, tool: ToolType) => {
    e.preventDefault();
    setDraggedTool(tool);
    setDragPos({ x: e.clientX, y: e.clientY });
  };

  const handleBallDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    outsideBallTargetRef.current = null;
    outsidePointerTargetRef.current = null;
    setIsDraggingBall(true);
    ballVel.current = { vx: 0, vy: 0 };
    lastDragPos.current = { x: e.clientX, y: e.clientY, time: Date.now() };
  };

  // Global Pointer Handlers for Dragging & Looking
  const handleAppPointerDown = (e: React.PointerEvent) => {
    // Check if we are interacting with modal, if so, don't trigger pointer tracking for eyes immediately if overlay covers
    setPointerState({ isDown: true, x: e.clientX, y: e.clientY });

    const pointerTarget = e.target instanceof Node ? e.target : null;

    if (
      showShopModal ||
      isSleeping ||
      roomTransition ||
      e.button !== 0 ||
      !pointerTarget ||
      !playAreaRef.current?.contains(pointerTarget) ||
      (e.target instanceof HTMLElement && e.target.closest(
        'button, input, textarea, select, [contenteditable="true"], [role="dialog"], [data-pet-movement-block]'
      ))
    ) return;

    const bounds = getIndoorPetBounds();
    if (currentRoom === RoomType.PLAYROOM) {
      const rect = playAreaRef.current?.getBoundingClientRect();
      if (!rect) return;
      const petHalfWidth = (192 * OUTSIDE_PET_SCALE) / 2;
      const petHalfHeight = (208 * OUTSIDE_PET_SCALE) / 2;
      const roomRect = roomRootRef.current?.getBoundingClientRect() || rect;
      const { sceneLeft, sceneWidth } = getRoomSceneHorizontalBounds(roomRect.width, roomRect.height);
      outsideBallTargetRef.current = null;
      outsidePointerTargetRef.current = {
        x: clamp(e.clientX - rect.left, sceneLeft + petHalfWidth, sceneLeft + sceneWidth - petHalfWidth),
        y: clamp(e.clientY - rect.top, petHalfHeight, rect.height - petHalfHeight),
      };
      return;
    }

    if (!bounds || e.clientY < bounds.rect.top || e.clientY > bounds.rect.bottom) return;
    indoorPetTargetXRef.current = clamp(e.clientX - bounds.rect.left, bounds.min, bounds.max);
  };

  const handleAppPointerMove = (e: React.PointerEvent) => {
    // 1. Update general look-at pointer state
    if (pointerState.isDown && !isDraggingBall) {
      setPointerState(prev => ({ ...prev, x: e.clientX, y: e.clientY }));
    }

    // 2. Handle Item/Tool Dragging
    if (draggedItem || draggedTool) {
      setDragPos({ x: e.clientX, y: e.clientY });
      setPointerState({ isDown: true, x: e.clientX, y: e.clientY });

      // Hover checks...
      if (petRef.current) {
        const rect = petRef.current.getBoundingClientRect();
        const isOver =
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom;

        setIsHoveringPet(isOver);

        if (isOver && draggedTool) {
          const now = Date.now();
          const relX = ((e.clientX - rect.left) / rect.width) * 200;
          const relY = ((e.clientY - rect.top) / rect.height) * 200;

          if (draggedTool === 'soap') {
            if (!activeSoapType.current) {
              activeSoapType.current = 'soap';
              soapConsumedOnRinse.current = false;
              const soapItem = getSoapItem();
              activeSoapMultiplier.current = Math.max(1, (soapItem?.hygiene || 50) / 50);
            }

            if (now - lastBubbleTime.current > 50) {
              const newBubble: Bubble = {
                id: now,
                x: clamp(relX + (Math.random() * 20 - 10), 36, 164),
                y: clamp(relY + (Math.random() * 20 - 10), 20, 190),
                size: Math.random() * 12 + 7
              };

              setBubbles(prev => {
                if (prev.length >= MAX_BUBBLES) return prev;
                return [...prev, newBubble];
              });
              lastBubbleTime.current = now;
            }
          } else if (draggedTool === 'shower') {
            // Only allow rinsing if we have reached the fully soaped state
            if (isSoapedUp) {
              setBubbles(prev => {
                const remaining = prev.filter(b => {
                  const distX = Math.abs(b.x - relX);
                  const isUnderShower = distX < 25 && (b.y > relY && b.y < relY + 150);
                  return !isUnderShower;
                });
                const rinsedBubbles = remaining.length <= RINSE_COMPLETE_THRESHOLD ? [] : remaining;
                if (rinsedBubbles.length < prev.length && stats.hygiene < 100) {
                  setStats(s => ({ ...s, hygiene: Math.min(100, s.hygiene + (0.5 * activeSoapMultiplier.current)) }));
                }
                if (rinsedBubbles.length === 0 && prev.length > 0 && activeSoapType.current && !soapConsumedOnRinse.current) {
                  soapConsumedOnRinse.current = true;
                  activeSoapType.current = null;
                  activeSoapMultiplier.current = 1;
                }
                return rinsedBubbles;
              });
            }
          }
        }
      }
    }

    // 3. Handle Ball Dragging (Physics Interaction)
    if (isDraggingBall) {
      const now = Date.now();
      const dt = now - lastDragPos.current.time;
      if (dt > 0) {
        const vx = (e.clientX - lastDragPos.current.x) * 0.7;
        const vy = (e.clientY - lastDragPos.current.y) * 0.7;
        ballVel.current = { vx, vy };
      }
      lastDragPos.current = { x: e.clientX, y: e.clientY, time: now };
      setBallPos({ x: e.clientX, y: e.clientY });
    }
  };

  const onFeed = (item: FoodItem) => {
    if (stats.hunger >= 100 || isSleeping) return;

    // Ensure we have the item
    if ((inventory[item.id] || 0) <= 0) return;

    consumeItem(item.id);
    setIsEating(true);
    setStats(prev => ({
      ...prev,
      hunger: Math.min(100, prev.hunger + item.hunger),
      // Food no longer increases energy
      happiness: Math.min(100, prev.happiness + (item.happiness || 0)),
    }));
    addXP(item.xp);
    setTimeout(() => setIsEating(false), 1000);
  };

  const handleAppPointerUp = (e: React.PointerEvent) => {
    setPointerState(prev => ({ ...prev, isDown: false }));

    // Drop Item/Tool
    if (draggedItem) {
      if (isHoveringPet) onFeed(draggedItem);
      setDraggedItem(null);
    }
    if (draggedTool) {
      setDraggedTool(null);
      if (draggedTool === 'shower' && isHoveringPet && isSoapedUp) {
        if (stats.hygiene > 90) addXP(5);
      }
    }
    setIsHoveringPet(false);

    // Drop Ball
    if (isDraggingBall) {
      outsideBallTargetRef.current = { x: e.clientX, y: e.clientY };
      if (currentRoom === RoomType.PLAYROOM && isSleeping) {
        outsideWakeUntilRef.current = Date.now() + SLEEP_WAKE_DURATION_MS;
        setIsSleeping(false);
      }
      setIsDraggingBall(false);
    }
  };

  // --- Game Actions ---
  const handlePlay = () => {
    if (stats.energy < 20) return;
    if (isSleeping) return;

    setIsPlaying(true);
    setStats(prev => ({
      ...prev,
      happiness: Math.min(100, prev.happiness + 15),
      energy: Math.max(0, prev.energy - 10),
      hunger: Math.max(0, prev.hunger - 5)
    }));
    addXP(15);
    setTimeout(() => setIsPlaying(false), 800);
  };
  // Ported unchanged from source: `handlePlay` exists but nothing wires to
  // it in the current render tree — `void` keeps that unused-but-present
  // state instead of deleting logic that may still be referenced by
  // something outside what this phase audited.
  void handlePlay;

  const handlePetClick = () => {
    if (isSleeping) {
      setIsSleeping(false);
      return;
    }
    setStats(prev => ({ ...prev, happiness: Math.min(100, prev.happiness + 5) }));
  };

  const handlePoopClick = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const nextSpawnAt = Date.now() + POOP_RESPAWN_MS;
    if (poopNextSpawnKey) localStorage.setItem(poopNextSpawnKey, String(nextSpawnAt));
    setIsPoopVisible(false);
    setShowPoopReward(false);
    window.setTimeout(() => setShowPoopReward(true), 0);
    window.setTimeout(() => setShowPoopReward(false), 1500);
    // Routed through the runtime's atomic addCoins (repository.mutateCoins)
    // instead of a raw setStats — a bare local setStats here is never
    // persisted, so the next loadSnapshot hydration (re-entering Virtual
    // Pet, F5, another tab) silently overwrites it with the still-stale
    // authoritative DB balance.
    addCoins(POOP_REWARD_COINS);
  };



  // Room switching cleanup & auto-show menus
  useEffect(() => {
    setShowFoodMenu(false);

    setShowBathroomMenu(false);
    if (currentRoom !== RoomType.BATHROOM) {
      setBubbles([]);
      setIsSoapedUp(false);
      activeSoapType.current = null;
      soapConsumedOnRinse.current = false;
      activeSoapMultiplier.current = 1;
    }
  }, [currentRoom]);

  const roomConfig = ROOM_THEMES[currentRoom];
  const roomExits = ROOM_EXITS[currentRoom] || [];
  const bathroomProgressPercent = isSoapedUp
    ? bubbles.length <= RINSE_COMPLETE_THRESHOLD
      ? 100
      : (1 - (bubbles.length / MAX_BUBBLES)) * 100
    : (bubbles.length / MAX_BUBBLES) * 100;
  const isRinseComplete = isSoapedUp && bubbles.length <= RINSE_COMPLETE_THRESHOLD;

  const handleStartGame = (gameId: string) => {
    onNavigateToGame(gameId);
  };

  useEffect(() => {
    if (currentRoom !== RoomType.PLAYROOM || !isBallMoving || isDraggingBall || !petRef.current) return;

    const rect = petRef.current.getBoundingClientRect();
    const padding = 36;
    const isBallNearPet =
      ballPos.x >= rect.left - padding &&
      ballPos.x <= rect.right + padding &&
      ballPos.y >= rect.top - padding &&
      ballPos.y <= rect.bottom + padding;

    if (!isBallNearPet) return;

    const now = Date.now();
    if (now - lastBallPlayTime.current < 900) return;

    lastBallPlayTime.current = now;
    setIsPlaying(true);
    setStats(prev => ({
      ...prev,
      happiness: Math.min(100, prev.happiness + 2),
    }));
    addXP(2);

    if (ballPlayTimer.current) clearTimeout(ballPlayTimer.current);
    ballPlayTimer.current = setTimeout(() => {
      setIsPlaying(false);
      ballPlayTimer.current = null;
    }, 700);
  }, [addXP, ballPos.x, ballPos.y, currentRoom, isBallMoving, isDraggingBall, setIsPlaying, setStats]);

  useEffect(() => {
    return () => {
      if (ballPlayTimer.current) clearTimeout(ballPlayTimer.current);
    };
  }, []);

  useEffect(() => {
    if (currentRoom !== RoomType.PLAYROOM || showShopModal || isSleeping) {
      outsideMovementKeysRef.current = { left: false, right: false, up: false, down: false };
      outsidePointerTargetRef.current = null;
      return;
    }

    const isEditableTarget = (target: EventTarget | null) => {
      const element = target instanceof HTMLElement ? target : null;
      return !!element?.closest('input, textarea, select, [contenteditable="true"]');
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (roomTransition) return;
      if (isEditableTarget(event.target) || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      outsidePointerTargetRef.current = null;
      outsideBallTargetRef.current = null;
      if (event.key === 'ArrowLeft') outsideMovementKeysRef.current.left = true;
      if (event.key === 'ArrowRight') outsideMovementKeysRef.current.right = true;
      if (event.key === 'ArrowUp') outsideMovementKeysRef.current.up = true;
      if (event.key === 'ArrowDown') outsideMovementKeysRef.current.down = true;
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') outsideMovementKeysRef.current.left = false;
      if (event.key === 'ArrowRight') outsideMovementKeysRef.current.right = false;
      if (event.key === 'ArrowUp') outsideMovementKeysRef.current.up = false;
      if (event.key === 'ArrowDown') outsideMovementKeysRef.current.down = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      outsideMovementKeysRef.current = { left: false, right: false, up: false, down: false };
    };
  }, [currentRoom, isSleeping, roomTransition, showShopModal]);

  useEffect(() => {
    if (currentRoom !== RoomType.PLAYROOM) {
      cancelAnimationFrame(outsidePetRaf.current);
      setOutsidePetPose('idle');
      return;
    }

    let lastFrameAt = performance.now();
    const tick = (frameAt: number) => {
      const area = playAreaRef.current;
      if (!area) {
        outsidePetRaf.current = requestAnimationFrame(tick);
        return;
      }

      const rect = area.getBoundingClientRect();
      const elapsedSeconds = Math.min((frameAt - lastFrameAt) / 1000, 0.05);
      lastFrameAt = frameAt;
      const current = outsidePetPosRef.current;
      const petWidth = 192 * OUTSIDE_PET_SCALE;
      const petHeight = 208 * OUTSIDE_PET_SCALE;
      const roomRect = roomRootRef.current?.getBoundingClientRect() || rect;
      const { sceneLeft, sceneWidth } = getRoomSceneHorizontalBounds(roomRect.width, roomRect.height);
      const outsideMinX = sceneLeft + petWidth / 2;
      const outsideMaxX = sceneLeft + sceneWidth - petWidth / 2;
      const latestBallPos = ballPosRef.current;
      const ballSpeed = Math.hypot(ballVel.current.vx, ballVel.current.vy);
      const ballIsReleasedAndMoving = isBallMovingRef.current && !isDraggingBallRef.current && ballSpeed > 0.5;
      const hasReleasedBallTarget = !!outsideBallTargetRef.current || ballIsReleasedAndMoving;
      const keys = outsideMovementKeysRef.current;
      const horizontalDirection = Number(keys.right) - Number(keys.left);
      const verticalDirection = Number(keys.down) - Number(keys.up);
      const pointerTarget = outsidePointerTargetRef.current;
      const chaseTarget = pointerTarget || (hasReleasedBallTarget
        ? { x: latestBallPos.x - rect.left, y: latestBallPos.y - rect.top }
        : null);

      if (Date.now() < outsideWakeUntilRef.current) {
        setOutsidePetPose('idle');
        outsidePetRaf.current = requestAnimationFrame(tick);
        return;
      }

      if (horizontalDirection !== 0 || verticalDirection !== 0) {
        const next = {
          x: clamp(
            current.x + horizontalDirection * INDOOR_PET_KEYBOARD_SPEED * elapsedSeconds,
            outsideMinX,
            outsideMaxX
          ),
          y: clamp(
            current.y + verticalDirection * INDOOR_PET_KEYBOARD_SPEED * elapsedSeconds,
            petHeight / 2,
            rect.height - petHeight / 2
          ),
        };
        outsidePetPosRef.current = next;
        setOutsidePetPos(next);
        setOutsidePetPose(horizontalDirection < 0 ? 'run-left' : 'run-right');
        outsidePetRaf.current = requestAnimationFrame(tick);
        return;
      }

      if (!chaseTarget || isDraggingBallRef.current) {
        setOutsidePetPose('idle');
        outsidePetRaf.current = requestAnimationFrame(tick);
        return;
      }

      const target = chaseTarget;
      const dx = target.x - current.x;
      const dy = target.y - current.y;
      const distance = Math.hypot(dx, dy);
      const stopDistance = pointerTarget ? INDOOR_PET_STOP_DISTANCE : 75;
      const shouldChase = distance > stopDistance;

      if (shouldChase) {
        const speed = pointerTarget
          ? Math.min(distance, INDOOR_PET_MOUSE_SPEED * elapsedSeconds)
          : Math.min(7, Math.max(2, distance * 0.045));
        const next = {
          x: clamp(current.x + (dx / distance) * speed, outsideMinX, outsideMaxX),
          y: clamp(current.y + (dy / distance) * speed, petHeight / 2, rect.height - petHeight / 2),
        };

        outsidePetPosRef.current = next;
        setOutsidePetPos(next);
        setOutsidePetPose(dx < 0 ? 'run-left' : 'run-right');
      } else if (ballIsReleasedAndMoving) {
        setOutsidePetPose(dx < 0 ? 'run-left' : 'run-right');
      } else {
        outsidePointerTargetRef.current = null;
        outsideBallTargetRef.current = null;
        setOutsidePetPose('idle');
      }

      outsidePetRaf.current = requestAnimationFrame(tick);
    };

    outsidePetRaf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(outsidePetRaf.current);
  }, [currentRoom]);

  return (
    <div
      ref={roomRootRef}
      className={`relative flex h-[100dvh] min-h-0 w-full flex-col items-center justify-between overflow-hidden py-[clamp(8px,2dvh,24px)] transition-colors duration-700 ease-in-out ${roomConfig.bg}`}
      style={{ isolation: 'isolate' }}
      onPointerDown={handleAppPointerDown}
      onPointerMove={handleAppPointerMove}
      onPointerUp={handleAppPointerUp}
      onPointerLeave={handleAppPointerUp}
    >
      <img
        data-room-background="scene"
        src={ROOM_BACKGROUNDS[currentRoom]}
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center center',
          imageRendering: 'pixelated',
          pointerEvents: 'none',
          userSelect: 'none',
          zIndex: -1,
        }}
      />

      {roomExits.map((exit) => {
        const isStackedGamesExit = currentRoom === RoomType.GAMES && exit.direction === 'right';
        const positionClass = exit.direction === 'left'
          ? 'left-3 top-1/2 -translate-y-1/2 sm:left-6'
          : exit.direction === 'right'
            ? isStackedGamesExit
              ? 'right-3 top-1/2 sm:right-6'
              : 'right-3 top-1/2 -translate-y-1/2 sm:right-6'
            : 'bottom-[clamp(7rem,18dvh,9.5rem)] left-1/2 -translate-x-1/2';
        const stackedGamesStyle = isStackedGamesExit
          ? {
              transform: exit.destination === RoomType.BEDROOM
                ? 'translateY(-112%)'
                : 'translateY(12%)',
            }
          : undefined;

        return (
          <div
            key={`${currentRoom}-${exit.direction}-${exit.destination}`}
            className={`pointer-events-none absolute z-[35] ${positionClass}`}
            style={stackedGamesStyle}
          >
            <button
              type="button"
              onClick={() => startRoomTransition(exit)}
              disabled={!!roomTransition || isRoomTransitionLoading}
              className="pointer-events-auto flex h-12 w-12 items-center justify-center border-4 border-[#684427] bg-[#ffe8a3] shadow-[4px_4px_0_#3f2a1b] transition-[transform,filter] hover:brightness-105 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#fff4bd] active:translate-x-1 active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:brightness-75 sm:h-16 sm:w-16"
              aria-label={exit.label}
              title={exit.label}
              data-pet-movement-block
            >
              <PixelSceneArrow direction={exit.direction} />
            </button>
          </div>
        );
      })}

      {currentRoom === RoomType.GAMES && !showGamesMenu && (
        <button
          type="button"
          onClick={() => setShowGamesMenu(true)}
          className="absolute left-[29%] top-[30%] z-[15] h-[34%] w-[36%] cursor-pointer bg-transparent outline-none focus-visible:border-4 focus-visible:border-[#fff1a8]"
          aria-label="Interact with the television and arcade machines"
          title="Play games"
          data-pet-movement-block
        >
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 border-[3px] border-[#4b2b20] bg-[#fff1b8] px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#4b2b20] shadow-[3px_3px_0_#29170f] opacity-80">
            Click / Space
          </span>
        </button>
      )}

      {currentRoom === RoomType.BATHROOM && !showBathroomMenu && (
        <button
          type="button"
          onClick={() => setShowBathroomMenu(true)}
          className="absolute left-[27%] top-[38%] z-[15] h-[34%] w-[22%] cursor-pointer bg-transparent outline-none focus-visible:border-4 focus-visible:border-[#fff1a8]"
          aria-label="Interact with the bathtub"
          title="Use bath tools"
          data-pet-movement-block
        >
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap border-[3px] border-[#4b2b20] bg-[#fff1b8] px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#4b2b20] shadow-[3px_3px_0_#29170f] opacity-80">
            Click / Space
          </span>
        </button>
      )}

      {currentRoom === RoomType.KITCHEN && !showFoodMenu && (
        <button
          type="button"
          onClick={() => setShowFoodMenu(true)}
          className="absolute left-[18%] top-[28%] z-[15] h-[42%] w-[12%] cursor-pointer bg-transparent outline-none focus-visible:border-4 focus-visible:border-[#fff1a8]"
          aria-label="Interact with the refrigerator"
          title="Open food inventory"
          data-pet-movement-block
        >
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap border-[3px] border-[#4b2b20] bg-[#fff1b8] px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#4b2b20] shadow-[3px_3px_0_#29170f] opacity-80">
            Click / Space
          </span>
        </button>
      )}

      {isRoomTransitionLoading && (
        <div
          key={loadingAnimationKey}
          className="pet-room-loading absolute inset-0 z-[90] flex items-center justify-center bg-[#271b13]/60 px-4 backdrop-blur-[3px]"
          role="status"
          aria-live="polite"
          aria-label="Loading next room"
        >
          <div className="w-full max-w-[520px] overflow-hidden border-4 border-[#5a3a22] bg-[#fff0b8] p-3 text-center shadow-[8px_8px_0_#2f2016] sm:p-5">
            <div className="pet-room-loading-sky relative h-44 overflow-hidden border-4 border-[#8c5d35] bg-[#9ee5f5]" aria-hidden="true">
              <div className="pet-room-loading-sun absolute right-6 top-5 h-10 w-10 border-4 border-[#b96824] bg-[#ffd45c] shadow-[4px_4px_0_rgba(111,71,34,0.25)]" />
              <div className="pet-room-loading-cloud pet-room-loading-cloud-one absolute left-5 top-7" />
              <div className="pet-room-loading-cloud pet-room-loading-cloud-two absolute right-20 top-16" />
              <div className="pet-room-loading-star absolute left-10 top-24" />
              <div className="pet-room-loading-star absolute right-12 top-24 scale-75" />
              <div className="absolute bottom-0 left-0 right-0 h-14 border-t-4 border-[#4f7b31] bg-[#83bd4a]" />
              <div className="pet-room-loading-flower absolute bottom-8 left-7" />
              <div className="pet-room-loading-flower absolute bottom-9 right-8" />

              <div className="pet-room-loading-track absolute bottom-4 left-4 right-4 h-5 border-4 border-[#5a3a22] bg-[#fff7cf]">
                <div className="pet-room-loading-progress h-full bg-[#f6a83b]" />
              </div>

              <div className="pet-room-loading-runner absolute bottom-7 h-[70px] w-[66px]">
                <div
                  className="pet-room-loading-cat"
                  style={{
                    backgroundImage: `url(${activePet.spriteSheetUrl})`,
                    backgroundPositionY: '-208px',
                  }}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-center gap-3 text-lg text-[#9b642f]" aria-hidden="true">
              {[0, 1, 2, 3].map((step) => (
                <span key={step} className="pet-room-loading-paw"><PixelPaw /></span>
              ))}
            </div>
            <div className="mt-2 font-black uppercase tracking-[0.16em] text-[#51341f] sm:text-lg">Tiny paws on the way!</div>
            <div className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-[#8b5a32] sm:text-sm">
              Loading the next cozy room...
            </div>
          </div>
        </div>
      )}

      {/* Dark Overlay for Sleep Mode (Global) */}
      {currentRoom === RoomType.BEDROOM && isSleeping && (
        <div className="absolute inset-0 bg-black/60 z-20 pointer-events-none transition-all duration-700 animate-in fade-in" />
      )}

      {/* Bedroom Lamp Switch */}
      {currentRoom === RoomType.BEDROOM && (
        <div
          className="pointer-events-none absolute left-[28%] z-[5] flex -translate-x-1/2 flex-col items-center"
          style={{ top: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className="h-[clamp(132px,20dvh,176px)] w-1 bg-slate-800/80" />

          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setIsSleeping(!isSleeping);
            }}
            className="pointer-events-auto -mt-1 flex h-[clamp(44px,8dvh,56px)] w-[clamp(44px,8dvh,56px)] touch-manipulation items-center justify-center text-[clamp(36px,8dvh,60px)] outline-none transition-transform duration-300 hover:scale-110 active:scale-95"
            title={isSleeping ? 'Turn On' : 'Turn Off'}
            aria-label={isSleeping ? 'Turn on bedroom light' : 'Turn off bedroom light'}
          >
            <span
              className={`rotate-180 transition-all duration-500 ${
                isSleeping
                  ? 'grayscale opacity-50'
                  : 'drop-shadow-[0_0_20px_rgba(255,235,59,0.8)]'
              }`}
            >
              💡
            </span>
          </button>
        </div>
      )}

      {/* Top Right UI */}
      <LevelIndicator stats={stats} />
      <CoinIndicator amount={stats.coins || 0} />

      {/* Stats HUD (Top Center) */}
      <StatsBar stats={stats} />

      {/* Soap/Shower Progress (Bathroom) */}
      {currentRoom === RoomType.BATHROOM && (bubbles.length > 0 || isSoapedUp) && (
        <div className="absolute top-48 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center animate-in fade-in zoom-in-95 duration-300 pointer-events-none select-none">

          {/* Progress Bar Container */}
          <div className={`w-48 h-2.5 bg-white/40 backdrop-blur-md rounded-full overflow-hidden shadow-lg ring-2 transition-all duration-500
            ${isSoapedUp && bubbles.length === MAX_BUBBLES
              ? 'scale-110 ring-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.6)]'
              : 'ring-white/40'}
            ${isRinseComplete ? 'ring-green-400' : ''}
          `}>

            <div
              className={`h-full transition-all duration-300 ease-out relative
                ${!isSoapedUp ? 'bg-gradient-to-r from-pink-300 to-purple-400' : ''}
                ${isSoapedUp && bubbles.length === MAX_BUBBLES ? 'bg-cyan-400 animate-pulse' : ''}
                ${isSoapedUp && bubbles.length < MAX_BUBBLES ? 'bg-gradient-to-r from-blue-400 to-cyan-500' : ''}
              `}
              style={{
                width: `${bathroomProgressPercent}%`
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent" />
            </div>
          </div>
        </div>
      )}

      {/* The Pet */}
      <div ref={playAreaRef} className="relative flex min-h-0 w-full flex-1 items-center justify-center">
        {currentRoom === RoomType.PLAYROOM ? (
          <div
            className="absolute z-20"
            style={{
              left: outsidePetPos.x,
              top: outsidePetPos.y,
              transform: 'translate(-50%, -50%)',
            }}
            data-pet-movement-block
          >
            <Pet
              ref={petRef}
              stats={stats}
              isSleeping={isSleeping}
              isEating={isEating}
              isPlaying={false}
              isHoveredWithFood={false}
              bubbles={[]}
              lookAt={isBallMoving ? ballPos : null}
              displayScale={OUTSIDE_PET_SCALE}
              showDirtyEffects={false}
              sleepLabelClassName="-top-4 -right-2"
              spriteSheetUrl={activePet.spriteSheetUrl}
              mouthPosition={activePet.mouthPosition}
              idleFrames={activePet.idleFrames}
              idleDuration={activePet.idleDuration}
              sleepInFrames={activePet.sleepInFrames}
              sleepHoldFrame={activePet.sleepHoldFrame}
              clickRow={activePet.clickRow}
              clickFrames={activePet.clickFrames}
              clickDuration={activePet.clickDuration}
              pose={outsidePetPose}
              onClick={handlePetClick}
            />
          </div>
        ) : currentRoom === RoomType.BEDROOM ? (
          <div
            className="absolute z-10 flex items-center justify-center"
            style={{
              left: indoorPetX,
              bottom: BEDROOM_BED_BOTTOM_OFFSET * bedroomSceneScale,
              transform: 'translateX(-50%)',
            }}
            data-pet-movement-block
          >
            <div
              className="relative z-10"
              style={{
                transform: `translateY(${(-28 * bedroomSceneScale) + indoorPetYOffset}px)`,
              }}
            >
              <Pet
                ref={petRef}
                stats={stats}
                isSleeping={isSleeping}
                isEating={isEating}
                isPlaying={isPlaying}
                isHoveredWithFood={isHoveringPet && !!draggedItem}
                bubbles={bubbles}
                lookAt={
                  pointerState.isDown
                    ? { x: pointerState.x, y: pointerState.y }
                    : null
                }
                displayScale={bedroomSceneScale * BEDROOM_PET_SCALE_MULTIPLIER}
                sleepVisualOffsetY={72 * bedroomSceneScale * BEDROOM_PET_SCALE_MULTIPLIER}
                sleepLabelClassName="top-24 right-14"
                spriteSheetUrl={activePet.spriteSheetUrl}
                mouthPosition={activePet.mouthPosition}
                idleFrames={activePet.idleFrames}
                idleDuration={activePet.idleDuration}
                sleepInFrames={activePet.sleepInFrames}
                sleepHoldFrame={activePet.sleepHoldFrame}
                clickRow={activePet.clickRow}
                clickFrames={activePet.clickFrames}
                clickDuration={activePet.clickDuration}
                pose={indoorPetPose}
                onClick={handlePetClick}
              />
            </div>
          </div>
        ) : (
          <div
            className="absolute top-1/2 z-20"
            style={{
              left: indoorPetX,
              transform: `translate(-50%, calc(-50% + ${INDOOR_PET_OFFSET_Y + indoorPetYOffset}px))`,
            }}
            data-pet-movement-block
          >
            <Pet
              ref={petRef}
              stats={stats}
              isSleeping={isSleeping}
              isEating={isEating}
              isPlaying={isPlaying}
              isHoveredWithFood={isHoveringPet && !!draggedItem}
              bubbles={bubbles}
              lookAt={pointerState.isDown ? { x: pointerState.x, y: pointerState.y } : null}
              displayScale={INDOOR_PET_SCALE}
              spriteSheetUrl={activePet.spriteSheetUrl}
              mouthPosition={activePet.mouthPosition}
              idleFrames={activePet.idleFrames}
              idleDuration={activePet.idleDuration}
              sleepInFrames={activePet.sleepInFrames}
              sleepHoldFrame={activePet.sleepHoldFrame}
              clickRow={activePet.clickRow}
              clickFrames={activePet.clickFrames}
              clickDuration={activePet.clickDuration}
              pose={indoorPetPose}
              onClick={handlePetClick}
            />
          </div>
        )}

        {/* Room Specific Decor */}
        {currentRoom === RoomType.BATHROOM && (
          <div className="absolute bottom-10 right-10 opacity-50 text-6xl animate-float">🦆</div>
        )}
        {currentRoom === RoomType.BATHROOM && isPoopVisible && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={handlePoopClick}
            className="absolute left-1/2 top-1/2 z-40 translate-x-[140px] translate-y-[110px] rounded-2xl p-2 transition-transform duration-200 hover:scale-110 active:scale-95"
            aria-label="Collect poop for 5 coins"
            title="+5 coins"
          >
            <img
              src={assetUrls?.care?.poop ?? poopUrl}
              alt=""
              draggable={false}
              className="h-[80px] w-[80px] object-contain drop-shadow-xl"
            />
          </button>
        )}
        {currentRoom === RoomType.BATHROOM && showPoopReward && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-50 translate-x-[150px] translate-y-[78px]">
            <div className="animate-poop-reward rounded-full bg-amber-400 px-3 py-1.5 text-[14px] font-black tracking-wider text-white">
              +5 coins
            </div>
          </div>
        )}
        {currentRoom === RoomType.GAMES && (
          // Icon removed as requested
          null
        )}

        {/* Playroom Store Button */}
        {false && currentRoom === RoomType.PLAYROOM && (
          <button
            onClick={() => undefined}
            className="absolute bottom-10 right-10 bg-white/40 hover:bg-white/60 backdrop-blur-md p-4 rounded-3xl border-4 border-pink-200 shadow-xl transition-all hover:scale-110 active:scale-95 group z-30"
          >
            <div className="text-4xl group-hover:rotate-12 transition-transform">🏪</div>
            <div className="mt-1 text-[10px] font-black text-pink-500 uppercase tracking-widest">Toy Shop</div>
          </button>
        )}
      </div>

      {/* Playroom Ball */}
      {currentRoom === RoomType.PLAYROOM && (
        <Ball
          position={ballPos}
          isDragging={isDraggingBall}
          onPointerDown={handleBallDown}
          color={TOY_ITEMS.find(t => t.id === activeBallId)?.color}
          icon={TOY_ITEMS.find(t => t.id === activeBallId)?.icon}
        />
      )}

      {/* Menus */}
      {showFoodMenu && currentRoom === RoomType.KITCHEN && (
        <FoodMenu
          onDragStart={handleDragStartItem}
          inventory={inventory}
          onOpenShop={() => {
            setShowFoodMenu(false);
            setShowShopModal(true);
          }}
          onClose={() => setShowFoodMenu(false)}
          items={foodItems}
        />
      )}

      {showBathroomMenu && currentRoom === RoomType.BATHROOM && (
        <BathroomMenu
          onDragStart={handleDragStartTool}
          onClose={() => setShowBathroomMenu(false)}
          isSoapedUp={isSoapedUp}
          isDirty={stats.hygiene < 60}
        />
      )}

      {currentRoom === RoomType.GAMES && showGamesMenu && (
        <GamesMenu
          onStartGame={handleStartGame}
          onClose={() => setShowGamesMenu(false)}
          extraGames={extraGames}
        />
      )}

      {/* Drag Visuals */}
      <DragLayer
        draggedItem={draggedItem}
        draggedTool={draggedTool}
        dragPos={dragPos}
        bubbles={bubbles}
        isHoveringPet={isHoveringPet}
        isSoapedUp={isSoapedUp}
      />

      {/* Bottom Controls */}
      <BottomControls
        onOpenShop={() => setShowShopModal(true)}
      />

      {/* Modals */}
      <ShopModal
        isOpen={showShopModal}
        onClose={() => setShowShopModal(false)}
        items={foodItems}
        inventory={inventory}
        activeBallId={activeBallId}
        coins={stats.coins}
        currentLevel={stats.level}
        onBuy={(item) => buyItem(item.id, item.price * currencyRate)}
        onBuyToy={(item) => {
          const toy = TOY_ITEMS.find((candidate) =>
            candidate.id === item.id ||
            candidate.label.toLowerCase() === item.label.toLowerCase() ||
            candidate.label.toLowerCase().replace(/\s+/g, '_') === item.id.toLowerCase()
          );
          const toyId = toy?.id || item.id;
          if ((inventory[toyId] || inventory[item.id] || 0) > 0) {
            setActiveBallId(toyId);
            return;
          }
          if (buyItem(toyId, item.price * currencyRate)) {
            setActiveBallId(toyId);
          }
        }}
        onSelectToy={(id) => setActiveBallId(id)}
        isLoading={isFoodLoading}
      />

    </div>
  );
};
