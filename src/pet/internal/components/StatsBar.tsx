import React from 'react';
import { PetStats } from '../types';

interface StatsBarProps {
  stats: PetStats;
}

type StatIcon = 'hunger' | 'energy' | 'happy' | 'clean';

const PixelStatIcon = ({ type }: { type: StatIcon }) => {
  const common = { viewBox: '0 0 16 16', className: 'h-4 w-4', shapeRendering: 'crispEdges' as const, 'aria-hidden': true };
  if (type === 'hunger') return <svg {...common}><path fill="currentColor" d="M1 1h2v6h2V1h2v6H5v8H3V7H1zM10 1h2v5h2v9h-2V8h-2z" /></svg>;
  if (type === 'energy') return <svg {...common}><path fill="currentColor" d="M9 0 2 9h5l-1 7 8-10H9z" /></svg>;
  if (type === 'happy') return <svg {...common}><path fill="currentColor" d="M3 1h10v2h2v10h-2v2H3v-2H1V3h2zm1 4v2h2V5zm6 0v2h2V5zM5 9v2h2v1h2v-1h2V9H9v1H7V9z" /></svg>;
  return <svg {...common}><path fill="currentColor" d="M7 0h2v4h4v2H9v4H7V6H3V4h4zM1 11h3v3H1zM11 11h4v4h-4z" /></svg>;
};

const ProgressBar = ({ value, color, icon, label }: { value: number; color: string; icon: StatIcon; label: string }) => (
  <div className="w-full">
    <div className="mb-1 flex items-center gap-1 text-[#4f493d]">
      <PixelStatIcon type={icon} />
      <span className="text-[9px] font-black uppercase tracking-[0.08em] sm:text-[10px]">{label}</span>
    </div>
    <div className="h-2.5 w-full overflow-hidden border-2 border-[#6f654f] bg-[#e9dfbd] shadow-[inset_1px_1px_0_rgba(255,255,255,0.7)]">
      <div
        className={`h-full ${color} transition-[width] duration-700`}
        style={{
          width: `${Math.max(5, Math.min(100, value))}%`,
          backgroundImage: 'repeating-linear-gradient(90deg, transparent 0 8px, rgba(255,255,255,0.38) 8px 10px)',
        }}
      />
    </div>
  </div>
);

const StatsBar: React.FC<StatsBarProps> = ({ stats }) => (
  <div className="absolute left-4 right-4 top-[72px] z-30 border-4 border-[#5f543e] bg-[#fff3c4]/95 px-3 py-2 shadow-[5px_5px_0_rgba(53,45,31,0.45)] sm:left-1/2 sm:right-auto sm:top-6 sm:w-80 sm:-translate-x-1/2 sm:px-4 sm:py-3">
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:gap-x-6 sm:gap-y-3">
      <ProgressBar value={stats.hunger} color="bg-orange-500" icon="hunger" label="Hunger" />
      <ProgressBar value={stats.energy} color="bg-blue-500" icon="energy" label="Energy" />
      <ProgressBar value={stats.happiness} color="bg-pink-500" icon="happy" label="Happy" />
      <ProgressBar value={stats.hygiene} color="bg-cyan-500" icon="clean" label="Clean" />
    </div>
  </div>
);

export default StatsBar;
