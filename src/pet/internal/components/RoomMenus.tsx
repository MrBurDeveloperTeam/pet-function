/**
 * Ported from Content Studio's `src/VirtualPet/components/RoomMenus.tsx`.
 * Only changes: soap/shower icon URLs resolve to bundled package assets
 * instead of host-relative `/images/...` paths. `GamesMenu`'s thumbnail
 * images and its `onStartGame` targets are deliberately left as
 * host-relative paths (`/games/flappy-cat/...`, etc.) — the 3 mini-games
 * themselves are NOT extracted into this package (see GamePage.tsx's file
 * header); the host must keep serving `public/games/**` exactly as today.
 */
import React, { useRef } from 'react';
import { FoodItem, ToolType, ExtraGame } from '../types';
import { useGameState } from '../../runtime/SharedPetRuntime';
import soapUrl from '../../../assets/pet/soap.png';
import showerUrl from '../../../assets/pet/shower.png';
import { FoodItemVisual } from './FoodItemVisual';

interface FoodMenuProps {
    onDragStart: (e: React.PointerEvent, item: FoodItem) => void;
    inventory: Record<string, number>;
    onClose: () => void;
    items: FoodItem[];
}

const isKitchenFoodItem = (item: FoodItem) => {
    const category = item.category.toLowerCase();
    const id = item.id.toLowerCase();

    return (
        category !== 'toys' &&
        category !== 'toy' &&
        category !== 'soap' &&
        category !== 'beds' &&
        category !== 'bed' &&
        !id.startsWith('ball_') &&
        !id.startsWith('bed_') &&
        id !== 'soap' &&
        id !== 'soap2'
    );
};

export const FoodMenu: React.FC<FoodMenuProps> = ({ onDragStart, inventory, onClose, items }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const availableItems = items.filter(item => isKitchenFoodItem(item) && (inventory[item.id] || 0) > 0);

    const handleWheel = (e: React.WheelEvent) => {
        if (scrollRef.current) {
            scrollRef.current.scrollLeft += e.deltaY;
        }
    };

    return (
        <div
            className="fixed left-6 top-[10.5rem] z-[45] w-[min(31.25rem,calc(100vw-3rem))] animate-in fade-in duration-200 xl:left-[11.5rem] xl:top-6 xl:w-[min(31.25rem,calc(50vw-22.25rem))]"
            role="dialog"
            aria-label="Food inventory"
            onPointerDown={(event) => {
                event.stopPropagation();
            }}
            data-pet-movement-block
        >
            <div className="relative flex w-full max-w-[500px] items-center gap-3 border-[5px] border-[#4b2b20] bg-[#fff0c7] px-4 pb-4 pt-12 shadow-[8px_8px_0_#29170f]">
                <div className="absolute left-4 top-3 text-sm font-black uppercase tracking-[0.12em] text-[#4b2b20]">Food inventory</div>
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-3 top-2 flex h-8 w-8 items-center justify-center border-[3px] border-[#4b2b20] bg-[#fff8df] text-xl font-black leading-none text-[#4b2b20] shadow-[3px_3px_0_#29170f] active:translate-x-1 active:translate-y-1 active:shadow-none"
                    aria-label="Close food inventory"
                >
                    ×
                </button>
                <div
                    ref={scrollRef}
                    onWheel={handleWheel}
                    className="flex h-22 min-w-0 flex-1 snap-x items-center gap-4 overflow-x-auto overflow-y-hidden px-4 pt-3 [scrollbar-width:thin] [scrollbar-color:#8b5a2b_transparent] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#8b5a2b]"
                >
                    {availableItems.length === 0 && (
                        <div className="mb-2 flex h-16 w-52 shrink-0 items-center justify-center border-[3px] border-dashed border-[#8b5a2b] bg-[#fff8df] px-4 text-center text-[13px] font-black tracking-wide text-orange-700 shadow-[3px_3px_0_#8b5a2b]">
                            Visit the Food Shop in Shopping Street
                        </div>
                    )}
                    {availableItems.map((item) => (
                        <div
                            key={item.id}
                            onPointerDown={(e) => onDragStart(e, item)}
                            className="relative flex h-16 w-16 shrink-0 snap-center cursor-grab items-center justify-center transition-all hover:-translate-y-0.5 active:cursor-grabbing active:scale-95"
                        >
                            <FoodItemVisual
                                item={item}
                                imageClassName="h-11 w-11 touch-none drop-shadow-sm"
                                emojiClassName="select-none touch-none text-4xl drop-shadow-sm"
                            />
                            <div className="pointer-events-none absolute -right-0 -top-0 z-10 flex h-5 min-w-5 items-center justify-center border-2 border-[#7b3517] bg-orange-500 text-[11px] font-black text-white shadow-[2px_2px_0_#7b3517]">
                                {inventory[item.id]}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

interface BathroomMenuProps {
    onDragStart: (e: React.PointerEvent, tool: ToolType) => void;
    onClose: () => void;
    isSoapedUp?: boolean;
    isDirty?: boolean;
}

const getBathroomToolIcons = (
    careOverrides?: { soap?: string; shower?: string }
): Record<ToolType, { src: string; alt: string }> => ({
    soap: { src: careOverrides?.soap ?? soapUrl, alt: 'Soap' },
    shower: { src: careOverrides?.shower ?? showerUrl, alt: 'Shower' },
});

export const BathroomMenu: React.FC<BathroomMenuProps> = ({ onDragStart, onClose, isSoapedUp, isDirty }) => {
    const { assetUrls } = useGameState();
    const BATHROOM_TOOL_ICONS = getBathroomToolIcons(assetUrls?.care);

    return (
    <div
        className="fixed left-6 top-[10.5rem] z-[45] animate-in fade-in duration-200 xl:left-[11.5rem] xl:top-6"
        role="dialog"
        aria-label="Bath tools"
        onPointerDown={(event) => {
            event.stopPropagation();
        }}
        data-pet-movement-block
    >
        <div className="relative flex items-end gap-8 border-[5px] border-[#4b2b20] bg-[#fff0c7] px-8 pb-5 pt-12 shadow-[8px_8px_0_#29170f]">
            <div className="absolute left-4 top-3 text-sm font-black uppercase tracking-[0.12em] text-[#4b2b20]">Bath tools</div>
            <button
                type="button"
                onClick={onClose}
                className="absolute right-3 top-2 flex h-8 w-8 items-center justify-center border-[3px] border-[#4b2b20] bg-[#fff8df] text-xl font-black leading-none text-[#4b2b20] shadow-[3px_3px_0_#29170f] active:translate-x-1 active:translate-y-1 active:shadow-none"
                aria-label="Close bath tools"
            >
                ×
            </button>
            {(['soap'] as const).map((tool) => {
                const disabled = !!isSoapedUp;
                return (
                    <div
                        key={tool}
                        onPointerDown={(e) => !disabled && onDragStart(e, tool)}
                        className={`relative flex flex-col items-center gap-1 transition-all duration-300 ${
                            disabled
                                ? 'opacity-40 scale-90 grayscale cursor-not-allowed'
                                : 'cursor-grab active:cursor-grabbing hover:scale-110'
                        }`}
                    >
                        <div className={`select-none touch-none ${isDirty && !isSoapedUp ? 'animate-breathe [animation-duration:800ms] ease-in-out' : ''}`}>
                            <img
                                src={BATHROOM_TOOL_ICONS[tool].src}
                                alt={BATHROOM_TOOL_ICONS[tool].alt}
                                draggable={false}
                                className="h-[72px] w-[72px] object-contain drop-shadow-md"
                            />
                        </div>
                        <span className={`text-[13px] tracking-wider font-bold uppercase transition-colors ${!disabled ? 'text-pink-500' : 'text-slate-400'}`}>
                            Soap
                        </span>
                    </div>
                );
            })}

            <div
                onPointerDown={(e) => isSoapedUp && onDragStart(e, 'shower')}
                className={`flex flex-col items-center gap-1 transition-all duration-300 ${
                    isSoapedUp
                        ? 'cursor-grab active:cursor-grabbing'
                        : 'opacity-30 grayscale cursor-not-allowed'
                }`}
            >
                <div className={`select-none touch-none transition-all ${isSoapedUp ? 'animate-breathe [animation-duration:800ms] ease-in-out' : ''}`}>
                    <img
                        src={BATHROOM_TOOL_ICONS.shower.src}
                        alt={BATHROOM_TOOL_ICONS.shower.alt}
                        draggable={false}
                        className="h-16 w-16 object-contain drop-shadow-md"
                    />
                </div>
                <span className={`text-[13px] pt-1 tracking-wider font-bold uppercase transition-colors ${isSoapedUp ? 'text-cyan-600' : 'text-slate-400'}`}>
                    Shower
                </span>
            </div>
        </div>
    </div>
    );
};

interface GamesMenuProps {
    onStartGame: (gameId: string) => void;
    onClose: () => void;
    /** Host-local games rendered as additional cards after the 3 built-in
     *  ones, same visual treatment. See `ExtraGame`'s own doc (types.ts). */
    extraGames?: ExtraGame[];
}

export const GamesMenu: React.FC<GamesMenuProps> = ({ onStartGame, onClose, extraGames }) => (
    <div
        className="fixed inset-0 z-[75] flex items-center justify-center bg-[#28170f]/70 p-4 backdrop-blur-[2px] animate-in fade-in duration-200"
        role="dialog"
        aria-modal="true"
        aria-label="Choose a game"
        onPointerDown={(event) => {
            event.stopPropagation();
            if (event.target === event.currentTarget) onClose();
        }}
        data-pet-movement-block
    >
        <div className="relative border-[5px] border-[#4b2b20] bg-[#7b367d] p-5 pt-14 shadow-[9px_9px_0_#29170f]">
            <div className="absolute left-4 top-3 font-black uppercase tracking-[0.12em] text-[#fff1b8]">Choose a game</div>
            <button
                type="button"
                onClick={onClose}
                className="absolute right-3 top-2 flex h-9 w-9 items-center justify-center border-[3px] border-[#4b2b20] bg-[#fff1b8] text-2xl font-black leading-none text-[#4b2b20] shadow-[3px_3px_0_#29170f] active:translate-x-1 active:translate-y-1 active:shadow-none"
                aria-label="Close game menu"
            >
                ×
            </button>
            <div className="flex flex-wrap justify-center gap-4">
            <button
                onClick={() => onStartGame('flappy')}
                className="flex flex-col items-center group transition-all duration-200 ease-out hover:scale-105 active:scale-95"
            >
                <div
                    className="w-20 h-20 bg-cover bg-center rounded-2xl shadow-lg flex items-center justify-center text-3xl font-black text-white group-hover:-rotate-12 transition-transform duration-200 ease-out border-4 border-white/50"
                    style={{ backgroundImage: "url('/games/flappy-cat/143.jpg?v=0.9.21')" }}
                />
                <span className="text-[10px] font-black text-white mt-1.5 uppercase tracking-wide drop-shadow-md">Flappy</span>
            </button>

            <button
                onClick={() => onStartGame('paccat')}
                className="flex flex-col items-center group transition-all duration-200 ease-out hover:scale-105 active:scale-95"
            >
                <div
                    className="w-20 h-20 bg-cover bg-center rounded-2xl shadow-lg flex items-center justify-center text-3xl font-black text-white group-hover:-rotate-12 transition-transform duration-200 ease-out border-4 border-white/50"
                    style={{ backgroundImage: "url('/games/pac-cat/img/145.jpg?v=0.9.21')" }}
                />
                <span className="text-[10px] font-black text-white mt-1.5 uppercase tracking-wide drop-shadow-md">Pac-Cat</span>
            </button>

            <button
                onClick={() => onStartGame('tetris')}
                className="flex flex-col items-center group transition-all duration-200 ease-out hover:scale-105 active:scale-95"
            >
                <div
                    className="w-20 h-20 bg-cover bg-center rounded-2xl shadow-lg flex items-center justify-center text-3xl font-black text-white group-hover:-rotate-12 transition-transform duration-200 ease-out border-4 border-white/50"
                                    style={{ backgroundImage: "url('/games/tetris/144.jpg?v=0.9.21')" }}
                />
                <span className="text-[10px] font-black text-white mt-1.5 uppercase tracking-wide drop-shadow-md">Tetris</span>
            </button>

            {(extraGames ?? []).map((game) => (
                <button
                    key={game.id}
                    onClick={game.onSelect}
                    className="flex flex-col items-center group transition-all duration-200 ease-out hover:scale-105 active:scale-95"
                >
                    <div
                        className="w-20 h-20 bg-cover bg-center rounded-2xl shadow-lg flex items-center justify-center text-3xl font-black text-white group-hover:-rotate-12 transition-transform duration-200 ease-out border-4 border-white/50"
                        style={{ backgroundImage: `url('${game.iconUrl}')` }}
                    />
                    <span className="text-[10px] font-black text-white mt-1.5 uppercase tracking-wide drop-shadow-md">{game.title}</span>
                </button>
            ))}
            </div>
        </div>
    </div>
);
