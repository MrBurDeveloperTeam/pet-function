import React from 'react';
import { AiOutlineShop } from 'react-icons/ai';

interface BottomControlsProps {
  onOpenShop: () => void;
}

const BottomControls: React.FC<BottomControlsProps> = ({ onOpenShop }) => (
  <div className="absolute left-2 top-[4.5rem] z-40 flex flex-col items-center sm:left-4 sm:top-[6.5rem]">
    <button
      type="button"
      onClick={onOpenShop}
      className="group relative flex h-12 w-12 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-orange-700/30 bg-orange-400 text-white shadow-[3px_3px_0_rgba(124,45,18,0.35)] transition-transform hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none sm:h-[70px] sm:w-[70px]"
      title="Shop"
      aria-label="Open shop"
    >
      <AiOutlineShop className="mb-0.5 h-5 w-5 sm:h-8 sm:w-8" strokeWidth={10} />
      <span className="text-[8px] font-black uppercase tracking-wider text-white sm:text-[11px] sm:tracking-widest">Shop</span>
    </button>
  </div>
);

export default BottomControls;
