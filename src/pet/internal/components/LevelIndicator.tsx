import React, { useState } from 'react';
import { PetStats } from '../types';

interface LevelIndicatorProps {
  stats: PetStats;
}

const CAT_HEAD_POINTS = '3,7 3,2 8,6 16,6 21,2 21,7 23,9 23,19 20,19 20,22 16,22 16,24 8,24 8,22 4,22 4,19 1,19 1,9';

const LevelIndicator: React.FC<LevelIndicatorProps> = ({ stats }) => {
  const [isOpen, setIsOpen] = useState(false);
  const xpPercent = Math.min(100, Math.max(0, stats.xp));
  const fillY = 24 - (xpPercent / 100) * 22;

  return (
    <div className="absolute right-2 top-2 z-50 flex flex-col items-end sm:right-6 sm:top-3">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="group relative h-14 w-14 shrink-0 cursor-pointer outline-none transition-transform hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 sm:h-20 sm:w-20"
        title={`Level ${stats.level}`}
        aria-expanded={isOpen}
      >
        <svg viewBox="0 0 24 24" className="h-full w-full overflow-visible drop-shadow-[3px_3px_0_rgba(55,38,21,0.45)]" shapeRendering="crispEdges" aria-hidden="true">
          <defs>
            <clipPath id="pixel-cat-level-mask"><polygon points={CAT_HEAD_POINTS} /></clipPath>
          </defs>
          <polygon points={CAT_HEAD_POINTS} fill="#fff0ad" stroke="#3f321f" strokeWidth="1.2" />
          <g clipPath="url(#pixel-cat-level-mask)">
            <rect x="0" y={fillY} width="24" height="24" fill="#238f83" className="transition-all duration-700" />
            <path fill="#6fd1bd" d="M3 8h18v3H3z" />
          </g>
          <polygon points={CAT_HEAD_POINTS} fill="none" stroke="#3f321f" strokeWidth="1.2" />
          <path fill="#3f321f" d="M1 13h5v1H1zM1 16h5v1H1zM18 13h5v1h-5zM18 16h5v1h-5z" />
        </svg>
        <span className="pointer-events-none absolute inset-x-0 top-[34%] text-center text-base font-black leading-none text-[#2f291f] sm:text-2xl">{stats.level}</span>
        <span className="pointer-events-none absolute inset-x-0 top-[60%] text-center text-[7px] font-black uppercase tracking-[0.08em] text-[#514632] sm:text-[9px]">Lvl</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-16 w-56 max-w-[90vw] border-4 border-[#5f543e] bg-[#fff3c4] p-4 text-[#3f321f] shadow-[5px_5px_0_rgba(53,45,31,0.5)] sm:top-24 sm:w-64">
          <div className="text-center">
            <h3 className="text-lg font-black uppercase tracking-wide">Level {stats.level}</h3>
            <div className="mt-1 text-xs font-black text-[#6f654f]">{Math.floor(stats.xp)} / 100 XP</div>
            <div className="mt-3 h-4 w-full overflow-hidden border-2 border-[#6f654f] bg-[#e9dfbd]">
              <div
                className="h-full bg-[#238f83] transition-[width] duration-500"
                style={{ width: `${xpPercent}%`, backgroundImage: 'repeating-linear-gradient(90deg, transparent 0 10px, rgba(255,255,255,0.4) 10px 12px)' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LevelIndicator;
