import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TiArrowBack } from 'react-icons/ti';
import { PixelCoinBag } from './CoinIndicator';
import type { PetStats } from '../types';

const MOLE_GAME_URL = '/games/mole-game/index.html?v=godot-v6';
const MOLE_GAME_SOURCE = 'pet-function:mole-game';
const MOLE_TUTORIAL_STORAGE_KEY = 'pet-function:mole-tutorial-complete-v1';
const MOLE_TUTORIAL_STEPS = [
  { title: 'Normal mole', detail: 'CLICK 1 TIME', interactive: true },
  { title: 'Armored mole', detail: 'CLICK 2 TIMES', interactive: true },
  { title: 'Bomb', detail: 'DO NOT CLICK', interactive: false },
  { title: 'Plaque tooth', detail: 'CLICK 1 TIME', interactive: true },
  { title: 'Cavity tooth', detail: 'CLICK 2 TIMES', interactive: true },
  { title: 'Shielded boss', detail: 'BREAK SHIELD + HIT AGAIN', interactive: true },
] as const;

type TutorialTargetBounds = { left: number; top: number; width: number; height: number };

const TUTORIAL_TARGET_GEOMETRY = [
  { baseWidth: 238, imageWidth: 405, imageHeight: 372 },
  { baseWidth: 238, imageWidth: 405, imageHeight: 359 },
  { baseWidth: 224, imageWidth: 395, imageHeight: 432 },
  { baseWidth: 230, imageWidth: 380, imageHeight: 355 },
  { baseWidth: 230, imageWidth: 380, imageHeight: 341 },
  { baseWidth: 286, imageWidth: 577, imageHeight: 578 },
] as const;

const calculateTutorialTargetBounds = (step: number, viewportWidth: number, viewportHeight: number): TutorialTargetBounds => {
  const geometry = TUTORIAL_TARGET_GEOMETRY[step] ?? TUTORIAL_TARGET_GEOMETRY[0];
  const hole = { x: 638, y: 429, scale: .88, rotation: -.02 };
  const gameOffset = { x: (viewportWidth - 1280) / 2, y: (viewportHeight - 720) / 2 };
  const spriteWidth = geometry.baseWidth * hole.scale;
  const spriteHeight = spriteWidth * geometry.imageHeight / geometry.imageWidth;
  const bob = Math.sin(.22 * 16) * 3;
  const bottom = 16 * hole.scale + bob + 48 * hole.scale;
  const localLeft = -spriteWidth / 2;
  const localTop = bottom - spriteHeight;
  const corners = [
    { x: localLeft, y: localTop },
    { x: localLeft + spriteWidth, y: localTop },
    { x: localLeft + spriteWidth, y: localTop + spriteHeight },
    { x: localLeft, y: localTop + spriteHeight },
  ].map(point => ({
    x: point.x * Math.cos(hole.rotation) - point.y * Math.sin(hole.rotation) + gameOffset.x + hole.x,
    y: point.x * Math.sin(hole.rotation) + point.y * Math.cos(hole.rotation) + gameOffset.y + hole.y,
  }));
  const padding = 12;
  const left = Math.min(...corners.map(point => point.x)) - padding;
  const top = Math.min(...corners.map(point => point.y)) - padding;
  const right = Math.max(...corners.map(point => point.x)) + padding;
  const bottomEdge = Math.max(...corners.map(point => point.y)) + padding;
  return { left, top, width: right - left, height: bottomEdge - top };
};

type MoleGameMessage = {
  source: typeof MOLE_GAME_SOURCE;
  type: 'game-started' | 'game-complete' | 'close' | 'tutorial-progress' | 'tutorial-target-bounds';
  score?: number;
  coins?: number;
  xp?: number;
  step?: number;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
};

const isMoleGameMessage = (value: unknown): value is MoleGameMessage => {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<MoleGameMessage>;
  return message.source === MOLE_GAME_SOURCE && (message.type === 'game-started' || message.type === 'game-complete' || message.type === 'close' || message.type === 'tutorial-progress' || message.type === 'tutorial-target-bounds');
};

export const PixelMoleMound = ({ onOpen }: { onOpen: () => void }) => (
  <button
    type="button"
    onClick={onOpen}
    className="group absolute left-[76%] top-[62%] z-[18] h-28 w-40 -translate-x-1/2 -translate-y-1/2 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#fff4bd]"
    aria-label="Enter the underground mole game"
    title="Enter the underground mole game"
    data-pet-movement-block
  >
    <svg viewBox="0 0 160 112" className="h-full w-full overflow-visible [image-rendering:pixelated]" shapeRendering="crispEdges" aria-hidden="true">
      <path fill="#6b3c20" d="M42 36h76v8h18v10h12v38H12V58h10V48h20z" />
      <path fill="#9b5d2d" d="M30 48h100v8h14v30H18V62h12z" />
      <path fill="#c47b39" d="M20 68h124v18H16V74h4z" />
      <path fill="#754121" d="M48 25h64v8h12v18H36V35h12z" />
      <path fill="#2b1a16" d="M53 21h54v7h10v18H43V31h10z" />
      <path fill="#120d0b" d="M59 19h42v6h9v14H50V28h9z" />
      <path fill="#e3a557" d="M24 60h18v7H24zM118 57h15v7h-15zM54 82h20v6H54zM91 71h14v6H91z" />
      <path fill="#6da83d" d="M8 82h20v8H8zM130 78h24v9h-24z" />
    </svg>
    <span className="absolute -top-3 left-1/2 -translate-x-1/2 border-2 border-[#55351f] bg-[#fff0a8] px-2 py-1 text-[9px] font-black uppercase text-[#55351f] opacity-0 shadow-[2px_2px_0_#55351f] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">Mole den</span>
  </button>
);

interface MoleGameProps {
  onClose: () => void;
  onExitPet: () => void;
  onReward: (coins: number, xp: number) => void;
  stats: PetStats;
}

const MOLE_LEVEL_HEAD = '3,7 3,2 8,6 16,6 21,2 21,7 23,9 23,19 20,19 20,22 16,22 16,24 8,24 8,22 4,22 4,19 1,19 1,9';

const MoleLevelBadge = ({ stats }: { stats: PetStats }) => {
  const xpPercent = Math.min(100, Math.max(0, stats.xp));
  const fillY = 24 - (xpPercent / 100) * 22;

  return (
    <div
      style={{ position: 'absolute', right: '1.5rem', top: '0.75rem', width: '5rem', height: '5rem', filter: 'drop-shadow(4px 4px 0 rgba(53,35,20,.55))' }}
      title={`Level ${stats.level}`}
      aria-label={`Level ${stats.level}`}
    >
      <svg viewBox="0 0 24 24" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} shapeRendering="crispEdges" aria-hidden="true">
        <defs><clipPath id="mole-game-level-mask"><polygon points={MOLE_LEVEL_HEAD} /></clipPath></defs>
        <polygon points={MOLE_LEVEL_HEAD} fill="#fff0ad" stroke="#3f321f" strokeWidth="1.35" />
        <g clipPath="url(#mole-game-level-mask)">
          <rect x="0" y={fillY} width="24" height="24" fill="#238f83" />
          <path fill="#6fd1bd" d="M3 8h18v3H3z" />
        </g>
        <polygon points={MOLE_LEVEL_HEAD} fill="none" stroke="#3f321f" strokeWidth="1.35" />
        <path fill="#3f321f" d="M1 13h5v1H1zM1 16h5v1H1zM18 13h5v1h-5zM18 16h5v1h-5z" />
      </svg>
      <span style={{ position: 'absolute', left: 0, right: 0, top: '34%', textAlign: 'center', color: '#2f291f', fontSize: '1.35rem', fontWeight: 900, lineHeight: 1 }}>{stats.level}</span>
      <span style={{ position: 'absolute', left: 0, right: 0, top: '61%', textAlign: 'center', color: '#514632', fontSize: '.58rem', fontWeight: 900, letterSpacing: '.08em', lineHeight: 1 }}>LVL</span>
    </div>
  );
};

export const MoleGame = ({ onClose, onExitPet, onReward, stats }: MoleGameProps) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const rewardedRef = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [tutorialTargetBounds, setTutorialTargetBounds] = useState<TutorialTargetBounds | null>(null);
  const [tutorialStep, setTutorialStep] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(MOLE_TUTORIAL_STORAGE_KEY) === 'true' ? null : 0;
  });

  const postTutorialState = useCallback((type: 'tutorial-active' | 'tutorial-complete' | 'tutorial-step', step?: number) => {
    frameRef.current?.contentWindow?.postMessage({ source: MOLE_GAME_SOURCE, type, step }, window.location.origin);
  }, []);

  const closeTutorial = useCallback(() => {
    window.localStorage.setItem(MOLE_TUTORIAL_STORAGE_KEY, 'true');
    setTutorialStep(null);
    postTutorialState('tutorial-complete');
  }, [postTutorialState]);

  useEffect(() => {
    if (!loaded || tutorialStep === null) return;
    const updateTutorialTargetBounds = () => setTutorialTargetBounds(calculateTutorialTargetBounds(tutorialStep, window.innerWidth, window.innerHeight));
    updateTutorialTargetBounds();
    window.addEventListener('resize', updateTutorialTargetBounds);
    postTutorialState('tutorial-active');
    postTutorialState('tutorial-step', tutorialStep);
    return () => window.removeEventListener('resize', updateTutorialTargetBounds);
  }, [loaded, postTutorialState, tutorialStep]);

  useEffect(() => {
    const receiveMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow || !isMoleGameMessage(event.data)) return;
      if (event.data.type === 'close') {
        onClose();
        return;
      }
      if (event.data.type === 'game-started') {
        rewardedRef.current = false;
        return;
      }
      if (event.data.type === 'tutorial-progress') {
        const completedStep = event.data.step;
        setTutorialStep(current => {
          if (current === null || completedStep !== current) return current;
          if (current === MOLE_TUTORIAL_STEPS.length - 1) {
            window.localStorage.setItem(MOLE_TUTORIAL_STORAGE_KEY, 'true');
            postTutorialState('tutorial-complete');
            return null;
          }
          return current + 1;
        });
        return;
      }
      if (event.data.type === 'tutorial-target-bounds') {
        const { left, top, width, height } = event.data;
        if ([left, top, width, height].every(value => typeof value === 'number' && Number.isFinite(value)) && width! > 0 && height! > 0) {
          setTutorialTargetBounds({ left: left!, top: top!, width: width!, height: height! });
        }
        return;
      }
      if (rewardedRef.current) return;
      const coins = Math.max(0, Math.min(9999, Math.floor(Number(event.data.coins) || 0)));
      const xp = Math.max(0, Math.min(20, Math.floor(Number(event.data.xp) || 0)));
      rewardedRef.current = true;
      onReward(coins, xp);
    };

    window.addEventListener('message', receiveMessage);
    return () => window.removeEventListener('message', receiveMessage);
  }, [onClose, onReward, postTutorialState]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <section
      className="pet-interface overflow-hidden bg-[#080503]"
      style={{ position: 'fixed', inset: 0, zIndex: 2000, width: '100vw', height: '100dvh' }}
      aria-label="Underground mole game scene"
      data-pet-movement-block
    >
      {!loaded && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#100a07] text-[#f4dec0]" role="status" aria-live="polite">
          <span className="h-12 w-12 animate-spin border-4 border-[#8b6a46] border-t-[#f4dec0]" />
          <span className="mt-5 text-sm font-black uppercase tracking-[0.25em]">Entering the mine...</span>
        </div>
      )}
      <iframe
        ref={frameRef}
        src={MOLE_GAME_URL}
        title="Underground mole game"
        className="h-full w-full border-0 bg-[#080503]"
        style={{ display: 'block', width: '100%', height: '100%', border: 0 }}
        allow="autoplay; fullscreen"
        onLoad={() => setLoaded(true)}
      />
      <div className="pointer-events-none absolute inset-0 z-20">
        <div className="absolute left-3 top-3 sm:left-6 sm:top-6" style={{ pointerEvents: 'auto' }}>
          <button
            type="button"
            onClick={onExitPet}
            className="flex items-center justify-center text-slate-700 transition-transform hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5"
            style={{ width: '4rem', height: '4rem', border: '4px solid #5a3a22', borderRadius: '5px', background: '#fff8d9', boxShadow: '5px 5px 0 rgba(53,35,20,.55)', pointerEvents: 'auto', cursor: 'pointer' }}
            title="Back"
            aria-label="Exit pet page"
          >
            <TiArrowBack className="h-8 w-8 sm:h-12 sm:w-12" />
          </button>
        </div>
        <div
          className="pointer-events-none flex select-none items-center gap-2 text-[#3f321f]"
          style={{ position: 'absolute', right: '7.25rem', top: '1.5rem', minWidth: '9.5rem', height: '3.5rem', padding: '.5rem 1rem', border: '4px solid #5a3a22', background: '#fff0ad', boxShadow: '5px 5px 0 rgba(53,35,20,.55)' }}
          aria-label={`${stats.coins || 0} coins`}
        >
          <PixelCoinBag />
          <span className="text-xl font-black tracking-wider">{stats.coins || 0}</span>
        </div>
        <MoleLevelBadge stats={stats} />
      </div>
      <button
        type="button"
        onClick={() => setTutorialStep(0)}
        style={{
          position: 'absolute',
          left: '1.5rem',
          top: '7rem',
          zIndex: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '.45rem',
          minWidth: '6.8rem',
          height: '3rem',
          padding: '0 .75rem',
          border: '4px solid #5a351d',
          outline: '2px solid #e7a33b',
          borderRadius: '3px',
          background: '#fff1b8',
          color: '#402719',
          boxShadow: '5px 5px 0 rgba(45,25,13,.75)',
          fontFamily: 'monospace',
          fontSize: '.78rem',
          fontWeight: 1000,
          letterSpacing: '.08em',
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
        aria-label="Open mole game tutorial"
        title="How to play"
      >
        <span aria-hidden="true" style={{ fontSize: '1.25rem', lineHeight: 1 }}>▤</span>
        GUIDE
      </button>
      {tutorialStep !== null && (
        <MoleGameTutorial
          step={tutorialStep}
          targetBounds={tutorialTargetBounds}
          onBack={() => setTutorialStep(current => current === null ? 0 : Math.max(0, current - 1))}
          onNext={() => tutorialStep === MOLE_TUTORIAL_STEPS.length - 1 ? closeTutorial() : setTutorialStep(tutorialStep + 1)}
          onSkip={closeTutorial}
        />
      )}
    </section>,
    document.body,
  );
};

const MoleGameTutorial = ({ step, targetBounds, onBack, onNext, onSkip }: { step: number; targetBounds: TutorialTargetBounds | null; onBack: () => void; onNext: () => void; onSkip: () => void }) => {
  const item = MOLE_TUTORIAL_STEPS[step];
  const cardStyle = { right: '2.5%', top: '13%' };
  const pixelButtonStyle = {
    border: '3px solid #5a351d',
    color: '#402719',
    fontWeight: 900,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
  };

  return (
    <div
      className="absolute inset-0 z-[70] overflow-hidden"
      style={{ position: 'absolute', inset: 0, zIndex: 70, overflow: 'hidden', fontFamily: 'monospace', pointerEvents: 'none' }}
      role="dialog"
      aria-modal="true"
      aria-label="Mole game tutorial"
    >
      {targetBounds && <div
        className="pointer-events-none absolute animate-pulse"
        style={{
          position: 'absolute',
          left: `${targetBounds.left}px`,
          top: `${targetBounds.top}px`,
          width: `${targetBounds.width}px`,
          height: `${targetBounds.height}px`,
          pointerEvents: 'none',
          border: '7px solid #ffe34f',
          outline: '4px solid #4b2c18',
          boxShadow: '0 0 0 9999px rgba(6,4,3,.86), 0 0 34px 14px rgba(255,227,79,.98), inset 0 0 22px rgba(255,227,79,.7)',
        }}
        aria-hidden="true"
      >
        <span
          style={{
            position: 'absolute',
            left: 'auto',
            right: 'calc(100% + .8rem)',
            top: '.35rem',
            transform: 'none',
            minWidth: '8.5rem',
            padding: '.45rem .8rem',
            border: '3px solid #4b2c18',
            background: '#ffe34f',
            color: '#3b2416',
            boxShadow: '4px 4px 0 #4b2c18',
            textAlign: 'center',
            fontSize: '.78rem',
            fontWeight: 1000,
            letterSpacing: '.13em',
            lineHeight: 1,
          }}
        >
          ▼ LOOK HERE ▼
        </span>
      </div>}
      <section
        className="absolute"
        style={{
          ...cardStyle,
          position: 'absolute',
          width: 'min(350px, calc(100% - 2rem))',
          border: '6px solid #5a351d',
          outline: '3px solid #f5b642',
          background: '#fff1b8',
          color: '#402719',
          padding: '1rem',
          boxShadow: '10px 10px 0 rgba(31,18,10,.88), inset 0 0 0 4px #d99639',
          opacity: 1,
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', marginBottom: '.8rem', paddingBottom: '.55rem', borderBottom: '4px dashed #b66e2d' }}>
          <strong style={{ color: '#402719', fontSize: '.78rem', fontWeight: 1000, textTransform: 'uppercase', letterSpacing: '.13em' }}>Nine Burrows Training</strong>
          <span style={{ border: '3px solid #5a351d', background: '#f6a83b', color: '#402719', padding: '.3rem .55rem', fontSize: '.72rem', fontWeight: 1000 }}>{step + 1} / {MOLE_TUTORIAL_STEPS.length}</span>
        </div>
        <h2 style={{ margin: 0, color: '#2f1b10', fontSize: '1.25rem', fontWeight: 1000, lineHeight: 1.2, textAlign: 'center', textTransform: 'uppercase' }}>{item.title}</h2>
        <p style={{ margin: '.65rem 0 0', color: item.interactive ? '#a33b1f' : '#cf342b', fontSize: '1.15rem', fontWeight: 1000, lineHeight: 1.2, textAlign: 'center', letterSpacing: '.08em' }}>{item.detail}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', marginTop: '1rem' }}>
          <button type="button" onClick={onSkip} style={{ ...pixelButtonStyle, border: 0, background: 'transparent', padding: '.55rem', fontSize: '.68rem', textDecoration: 'underline' }}>Skip tutorial</button>
          <div style={{ display: 'flex', gap: '.55rem' }}>
            <button type="button" onClick={onBack} disabled={step === 0} style={{ ...pixelButtonStyle, background: '#fff8dc', padding: '.55rem .8rem', fontSize: '.7rem', opacity: step === 0 ? .4 : 1 }}>Back</button>
            {!item.interactive && <button type="button" onClick={onNext} style={{ ...pixelButtonStyle, background: '#f6a83b', padding: '.55rem 1rem', fontSize: '.7rem', boxShadow: '4px 4px 0 #5a351d' }}>I understand</button>}
          </div>
        </div>
      </section>
    </div>
  );
};
