import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PixelCoinBag } from './CoinIndicator';
import type { PetStats } from '../types';

const MOLE_GAME_URL = '/games/mole-game/index.html?v=godot-v12';
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
type TutorialTargetViewportBounds = TutorialTargetBounds & { viewportWidth: number; viewportHeight: number };

type MoleGameMessage = {
  source: typeof MOLE_GAME_SOURCE;
  type: 'game-error' | 'game-progress' | 'game-ready' | 'game-started' | 'game-complete' | 'close' | 'tutorial-progress' | 'tutorial-target-bounds';
  progress?: number;
  error?: string;
  score?: number;
  coins?: number;
  xp?: number;
  step?: number;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  viewportWidth?: number;
  viewportHeight?: number;
};

const isMoleGameMessage = (value: unknown): value is MoleGameMessage => {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<MoleGameMessage>;
  return message.source === MOLE_GAME_SOURCE && (message.type === 'game-error' || message.type === 'game-progress' || message.type === 'game-ready' || message.type === 'game-started' || message.type === 'game-complete' || message.type === 'close' || message.type === 'tutorial-progress' || message.type === 'tutorial-target-bounds');
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
      {/* A recessed ground opening, seen from the same elevated angle as the lawn. */}
      <path fill="#456329" opacity=".4" d="M38 29h84v7h20v13h12v28h-12v13h-20v7H38v-7H18V77H6V49h12V36h20z" />
      <path fill="#59432d" d="M42 26h76v7h20v12h12v30h-12v13h-20v7H42v-7H22V75H10V45h12V33h20z" />
      <path fill="#9b7445" d="M42 30h76v7h19v12h9v23h-12v12h-18v7H44v-7H26V72H14V49h12V37h16z" />
      <path fill="#352619" d="M47 39h66v6h17v10h8v16h-13v10h-20v5H55v-5H35V71H23V55h9V45h15z" />
      <path fill="#1b1510" d="M48 46h64v6h16v10h7v10h-13v8h-19v4H57v-4H38v-8H26V62h7V52h15z" />
      <path fill="#090b08" d="M52 54h56v5h15v9h8v6h-13v7H43v-7H30v-6h8v-9h14z" />
      <path fill="#c3a16c" d="M44 27h22v10H44zM76 26h24v10H76zM112 31h17v11h-17zM132 46h14v12h-14zM18 44h16v12H18zM29 33h16v11H29z" />
      <path fill="#806e53" d="M14 61h14v12H14zM27 75h20v12H27zM47 84h23v10H47zM81 86h23v9H81zM111 80h22v10h-22zM135 63h13v14h-13z" />
      <path fill="#b59a6c" d="M28 75h17v4H28zM49 84h19v4H49zM83 86h18v4H83zM113 80h17v4h-17z" />
      <path fill="#63973b" d="M5 48h9v-9h5v18H5zM140 80h8v-8h6v15h-14zM34 91h9v-6h5v12H34zM103 29h9v-7h5v14h-14z" />
    </svg>
    <span className="absolute -top-3 left-1/2 -translate-x-1/2 border-2 border-[#55351f] bg-[#fff0a8] px-2 py-1 text-[9px] font-black uppercase text-[#55351f] opacity-0 shadow-[2px_2px_0_#55351f] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">Mole den</span>
  </button>
);

interface MoleGameProps {
  onClose: () => void;
  onReward: (coins: number, xp: number) => void;
  stats: PetStats;
}

const MOLE_LEVEL_HEAD = '3,7 3,2 8,6 16,6 21,2 21,7 23,9 23,19 20,19 20,22 16,22 16,24 8,24 8,22 4,22 4,19 1,19 1,9';

export const MoleLevelBadge = ({ stats }: { stats: Pick<PetStats, 'level' | 'xp'> }) => {
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

export const MoleGame = ({ onClose, onReward, stats }: MoleGameProps) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const rewardedRef = useRef(false);
  const tutorialTargetViewportBoundsRef = useRef<TutorialTargetViewportBounds | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState<number | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [tutorialTargetBounds, setTutorialTargetBounds] = useState<TutorialTargetBounds | null>(null);
  const [tutorialStep, setTutorialStep] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(MOLE_TUTORIAL_STORAGE_KEY) === 'true' ? null : 0;
  });

  const projectTutorialTargetBounds = useCallback((bounds: TutorialTargetViewportBounds) => {
    const frameRect = frameRef.current?.getBoundingClientRect();
    if (!frameRect || bounds.viewportWidth <= 0 || bounds.viewportHeight <= 0) return;
    const scaleX = frameRect.width / bounds.viewportWidth;
    const scaleY = frameRect.height / bounds.viewportHeight;
    setTutorialTargetBounds({
      left: frameRect.left + bounds.left * scaleX,
      top: frameRect.top + bounds.top * scaleY,
      width: bounds.width * scaleX,
      height: bounds.height * scaleY,
    });
  }, []);

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
    tutorialTargetViewportBoundsRef.current = null;
    setTutorialTargetBounds(null);
    postTutorialState('tutorial-active');
    postTutorialState('tutorial-step', tutorialStep);
  }, [loaded, postTutorialState, tutorialStep]);

  useEffect(() => {
    const updateTutorialTargetBounds = () => {
      if (tutorialTargetViewportBoundsRef.current) projectTutorialTargetBounds(tutorialTargetViewportBoundsRef.current);
    };
    window.addEventListener('resize', updateTutorialTargetBounds);
    return () => window.removeEventListener('resize', updateTutorialTargetBounds);
  }, [projectTutorialTargetBounds]);

  useEffect(() => {
    if (loaded) return;
    const requestReady = () => frameRef.current?.contentWindow?.postMessage({ source: MOLE_GAME_SOURCE, type: 'request-game-ready' }, window.location.origin);
    const timer = window.setInterval(requestReady, 1000);
    return () => window.clearInterval(timer);
  }, [loaded, loadAttempt]);

  useEffect(() => {
    const receiveMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow || !isMoleGameMessage(event.data)) return;
      if (event.data.type === 'game-progress') {
        const progress = event.data.progress;
        if (typeof progress === 'number' && Number.isFinite(progress)) setLoadProgress(current => Math.max(current ?? 0, Math.min(99, Math.max(0, progress))));
        return;
      }
      if (event.data.type === 'game-error') { setLoadError(event.data.error || 'Unable to start the game.'); return; }
      if (event.data.type === 'close') {
        onClose();
        return;
      }
      if (event.data.type === 'game-ready') {
        setLoaded(true);
        if (tutorialStep === null) postTutorialState('tutorial-complete');
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
        const { left, top, width, height, viewportWidth, viewportHeight } = event.data;
        if ([left, top, width, height, viewportWidth, viewportHeight].every(value => typeof value === 'number' && Number.isFinite(value)) && width! > 0 && height! > 0 && viewportWidth! > 0 && viewportHeight! > 0) {
          const bounds = { left: left!, top: top!, width: width!, height: height!, viewportWidth: viewportWidth!, viewportHeight: viewportHeight! };
          tutorialTargetViewportBoundsRef.current = bounds;
          projectTutorialTargetBounds(bounds);
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
  }, [onClose, onReward, postTutorialState, projectTutorialTargetBounds, tutorialStep]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <section
      className="pet-interface overflow-hidden"
      style={{ position: 'fixed', inset: 0, zIndex: 2000, width: '100vw', height: '100dvh', background: '#080503' }}
      aria-label="Underground mole game scene"
      data-pet-movement-block
    >
      {!loaded && (
        <div className="absolute inset-0 z-10" style={{ background: "#211610 url('/games/mole-game/loading-mine.png?v=keyart-2') center / cover no-repeat", color: '#fff1d0', fontFamily: 'MoleLoadingPixel, monospace' }}>
          <style>{`@font-face{font-family:MoleLoadingPixel;src:url('/games/mole-game/Quadrit.ttf')}@keyframes moleLoadingSweep{from{left:-35%}to{left:105%}}`}</style>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(20,12,8,.05) 30%,rgba(20,12,8,.88) 100%)' }} />
          <div style={{ position: 'absolute', left: '8%', bottom: '10%', width: 'min(620px,84%)' }}>
            <div style={{ fontSize: 11, letterSpacing: 3, color: '#dbc9a6' }}>GULU MINING CLUB</div>
            <h1 style={{ fontSize: 'clamp(30px,4vw,48px)', margin: '14px 0 28px', lineHeight: 1.2, textShadow: '3px 3px #39271d' }}>MOLE HUNT</h1>
            {!loadError && <>
              <div role="progressbar" aria-label="Loading Mole Hunt" aria-valuemin={0} aria-valuemax={100} aria-valuenow={loadProgress ?? undefined} style={{ position: 'relative', height: 20, border: '2px solid #d6b87c', padding: 3, background: '#211610', overflow: 'hidden', boxSizing: 'border-box' }}>
                <div style={{ height: '100%', width: `${loadProgress ?? 0}%`, background: 'repeating-linear-gradient(90deg,#e8bf63 0 23px,#bb8c3e 23px 25px)', transition: 'width .15s linear' }} />
                <span aria-hidden="true" style={{ position: 'absolute', top: 3, bottom: 3, width: '30%', background: 'linear-gradient(90deg,transparent,rgba(255,237,179,.8),transparent)', animation: 'moleLoadingSweep 1.2s linear infinite' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontSize: 11 }}><span>{loadProgress !== null && loadProgress >= 99 ? 'GETTING READY TO PLAY' : 'PREPARING THE MINE'}</span><span>{loadProgress === null ? '...' : `${Math.floor(loadProgress)}%`}</span></div>
            </>}
            {loadError && <><p role="alert" style={{ lineHeight: 1.8 }}>{loadError}</p><button type="button" onClick={() => { setLoadError(null); setLoadProgress(null); setLoadAttempt(value => value + 1); }} style={{ marginTop: '1rem', color: '#fff1d0', background: '#473428', border: '2px solid #d6b87c', padding: '.75rem 1.25rem' }}>TRY AGAIN</button></>}
          </div>
        </div>
      )}
      <iframe
        ref={frameRef}
        key={loadAttempt}
        src={`${MOLE_GAME_URL}&attempt=${loadAttempt}`}
        title="Underground mole game"
        className="h-full w-full border-0 bg-[#080503]"
        style={{ display: 'block', width: '100%', height: '100%', border: 0 }}
        allow="autoplay; fullscreen"
      />
      <div className="pointer-events-none absolute inset-0 z-20">
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
      {loaded && <button
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
      </button>}
      {loaded && tutorialStep !== null && (
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
