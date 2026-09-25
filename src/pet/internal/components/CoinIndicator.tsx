import React from 'react';

interface CoinIndicatorProps {
  amount: number;
}

export const PixelCoinBag = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6 sm:h-8 sm:w-8" aria-hidden="true" shapeRendering="crispEdges">
    <path fill="#8b5a2b" d="M8 2h8v3h2v3h-2v2h3v3h2v7h-2v2H5v-2H3v-7h2v-3h3V8H6V5h2z" />
    <path fill="#f7b733" d="M8 6h8v3H8zM7 11h10v2h2v7H5v-7h2z" />
    <path fill="#ffe071" d="M8 12h3v2H8z" />
    <path fill="#7a451f" d="M11 12h3v2h2v2h-2v1h2v2h-3v2h-2v-2H9v-2h5v-1H9v-2h2z" />
  </svg>
);

const CoinIndicator: React.FC<CoinIndicatorProps> = ({ amount }) => (
  <div className="absolute right-16 top-3 z-40 flex cursor-default select-none items-center gap-1 border-[3px] border-[#6b4423] bg-[#fff0ad] px-2 py-1 text-[#3f321f] shadow-[4px_4px_0_rgba(53,35,20,0.45)] sm:right-32 sm:top-8 sm:gap-2 sm:px-4 sm:py-2">
    <PixelCoinBag />
    <span className="text-sm font-black tracking-wider sm:text-xl">{amount}</span>
  </div>
);

export default CoinIndicator;
