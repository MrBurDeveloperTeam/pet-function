import { useEffect, useRef, useState } from 'react';

const MOLE_GAME_URL = '/games/mole-game/index.html?v=godot-v1';
const MOLE_GAME_SOURCE = 'pet-function:mole-game';

type MoleGameMessage = {
  source: typeof MOLE_GAME_SOURCE;
  type: 'game-started' | 'game-complete' | 'close';
  score?: number;
  coins?: number;
  xp?: number;
};

const isMoleGameMessage = (value: unknown): value is MoleGameMessage => {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<MoleGameMessage>;
  return message.source === MOLE_GAME_SOURCE && (message.type === 'game-started' || message.type === 'game-complete' || message.type === 'close');
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

export const MoleGame = ({ onClose, onReward }: { onClose: () => void; onReward: (coins: number, xp: number) => void }) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const rewardedRef = useRef(false);
  const [loaded, setLoaded] = useState(false);

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
      if (rewardedRef.current) return;
      const coins = Math.max(0, Math.min(30, Math.floor(Number(event.data.coins) || 0)));
      const xp = Math.max(0, Math.min(40, Math.floor(Number(event.data.xp) || 0)));
      rewardedRef.current = true;
      onReward(coins, xp);
    };

    window.addEventListener('message', receiveMessage);
    return () => window.removeEventListener('message', receiveMessage);
  }, [onClose, onReward]);

  return (
    <section className="fixed inset-0 z-[100] overflow-hidden bg-[#080503]" aria-label="Underground mole game scene" data-pet-movement-block>
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
        allow="autoplay; fullscreen"
        onLoad={() => setLoaded(true)}
      />
    </section>
  );
};
