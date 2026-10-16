import {RoomDecorCatalog} from './RoomDecorCatalog';
import {CABINET_ITEMS} from '../cabinets.mjs';
import {DECOR_ITEMS} from '../roomDecor.mjs';
import { FISHING_RODS } from './FishingGame';
/**
 * Ported verbatim from Content Studio's `src/VirtualPet/components/ShopModal.tsx`,
 * with `useGameState` now imported from this package's own shared pet
 * runtime instead of Content Studio's local context.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Apple,
  Archive,
  ArrowLeft,
  Candy,
  Coffee,
  CupSoda,
  Drumstick,
  Gamepad2,
  Lock,
  ShoppingBag,
  Smile,
  Utensils,
  X,
  type LucideIcon,
} from 'lucide-react';
import { FoodItem } from '../types';
import { useGameState } from '../../runtime/SharedPetRuntime';
import { TOY_ITEMS, isFishingRewardItem } from '../constants';
import { AiOutlineShop } from 'react-icons/ai';
import { FoodItemVisual } from './FoodItemVisual';
import { PixelCoinBag } from './CoinIndicator';
import { ShoppingLayout } from './ShoppingLayout';
import { useShopDialogue } from './ShopDialogue';

interface ShopModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: FoodItem[];
  inventory: Record<string, number>;
  activeBallId: string;
  coins: number;
  currentLevel: number;
  onBuy: (item: FoodItem) => boolean | Promise<boolean>;
  onBuyToy: (item: FoodItem) => boolean | Promise<boolean>;
  onSelectToy: (id: string) => void;
  isLoading?: boolean;
  shopType: 'food' | 'furniture';
}

const CATEGORY_STYLES: Record<string, { bg: string; border: string; text: string; accent: string }> = {
  Healthy: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', accent: 'bg-emerald-100' },
  Breakfast: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', accent: 'bg-yellow-100' },
  Meals: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', accent: 'bg-orange-100' },
  Drinks: { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700', accent: 'bg-sky-100' },
  Sweets: { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700', accent: 'bg-pink-100' },
  Toys: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', accent: 'bg-slate-100' },
  Default: { bg: 'bg-stone-50', border: 'border-stone-200', text: 'text-stone-700', accent: 'bg-stone-100' },
};

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Healthy: Apple,
  Breakfast: Coffee,
  Meals: Drumstick,
  Drinks: CupSoda,
  Sweets: Candy,
  Toys: Gamepad2,
  'Room Decor': Archive,
  Default: ShoppingBag,
};

const CATEGORY_ORDER = ['Healthy', 'Breakfast', 'Meals', 'Drinks', 'Sweets', 'Toys', 'Room Decor', 'Fishing Rods'];
const SHOP_CATEGORIES = {
  food: ['Healthy', 'Breakfast', 'Meals', 'Drinks', 'Sweets'],
  furniture: ['Toys', 'Room Decor', 'Fishing Rods'],
} as const;

const SHOP_BUTTONS = {
  buy: 'border-[3px] border-[#7b3517] bg-[#f06422] text-white shadow-[4px_4px_0_#7b3517] hover:bg-[#dc5318] active:translate-x-1 active:translate-y-1 active:shadow-none',
  select: 'border-[3px] border-[#7b3517] bg-[#ffd27a] text-[#6a351c] shadow-[4px_4px_0_#7b3517] hover:bg-[#ffc45c] active:translate-x-1 active:translate-y-1 active:shadow-none',
  active: 'cursor-default border-[3px] border-[#238f83] bg-[#bcebdc] text-[#175f58] shadow-[4px_4px_0_#175f58]',
  disabled: 'border-[3px] border-[#aaa18d] bg-[#ded9cc] text-[#817968]',
  locked: 'cursor-not-allowed border-[3px] border-[#817968] bg-[#c9c3b5] text-[#5e584c]',
};

const findToyByShopItem = (item: Pick<FoodItem, 'id' | 'label'>) => {
  const normalizedLabel = item.label.toLowerCase();
  const normalizedId = item.id.toLowerCase();

  return TOY_ITEMS.find((toy) =>
    toy.id.toLowerCase() === normalizedId ||
    toy.label.toLowerCase() === normalizedLabel ||
    toy.label.toLowerCase().replace(/\s+/g, '_') === normalizedId
  );
};

const ToyVisual = ({ item, size = 'large' }: { item: FoodItem; size?: 'small' | 'large' }) => {
  return (
    <FoodItemVisual
      item={item}
      imageClassName={size === 'large' ? 'h-16 w-16' : 'h-10 w-10'}
      emojiClassName={size === 'large' ? 'text-6xl' : 'text-4xl'}
    />
  );
};

const ShopModal: React.FC<ShopModalProps> = ({
  isOpen,
  onClose,
  items: catalogItems,
  inventory,
  activeBallId,
  coins,
  currentLevel,
  onBuy,
  onBuyToy,
  onSelectToy,
  isLoading = false,
  shopType,
}) => {
  const { currencyRate, buyItem } = useGameState();
  const { say, closing, dialogueActive, requestClose } = useShopDialogue();
  const closeShop = requestClose ?? onClose;
  const rods=Object.values(FISHING_RODS).filter(rod=>rod.id!=='beginner_rod').sort((a,b)=>a.rarityBoost-b.rarityBoost);
  const items = useMemo(() => {
    const available=catalogItems.filter(item=>!isFishingRewardItem(item.id)&&item.category!=='Beds');
    // Local/offline catalogs may omit toys; keep their shelf usable.
    if(!available.some(item=>item.category==='Toys')) available.push(...TOY_ITEMS.map(toy=>({...toy,category:'Toys',hunger:0,xp:0})));
    return available;
  }, [catalogItems]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const formatPrice = (baseUSD: number) => {
    const converted = baseUSD * currencyRate;
    return converted % 1 === 0 ? converted.toFixed(0) : converted.toFixed(2).replace(/\.?0+$/, '');
  };

  const categories = useMemo(() => {
    const available = new Set(items.map(item => item.category));
    available.delete('Soap');
    available.add('Fishing Rods'); available.add('Room Decor');
    const allowed = new Set<string>(SHOP_CATEGORIES[shopType]);
    return [
      ...CATEGORY_ORDER.filter(category => available.has(category) && allowed.has(category)),
    ];
  }, [items, shopType]);

  const filteredItems = useMemo(() => {
    if (!selectedCategory) return [];
    return items.filter(item => item.category === selectedCategory);
  }, [items, selectedCategory]);

  useEffect(() => {
    if (!isOpen) {
      const t = setTimeout(() => setSelectedCategory(null), 300);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedCategory(null);
  }, [shopType]);

  useEffect(() => {
    if (!isOpen) return;
    const handleCloseKey = (event: KeyboardEvent) => {
      // A visible line owns Space, including when a purchase button has focus.
      if (event.code === 'Space' && dialogueActive) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.repeat) closeShop();
      }
    };
    window.addEventListener('keydown', handleCloseKey, true);
    return () => window.removeEventListener('keydown', handleCloseKey, true);
  }, [isOpen, closeShop, dialogueActive]);

  if (!isOpen) return null;

  const selectedStyle = CATEGORY_STYLES[selectedCategory || 'Default'] || CATEGORY_STYLES.Default;

  // PATCH 0.6.8: raised from z-50 to z-[80] so this overlay stacks above
  // VirtualPetContent's room Back button (z-[70]) — normal room content
  // elsewhere in PetRoom already reaches z-50, so lowering the Back button
  // instead risked it dropping below legitimate room content; raising only
  // this overlay is the minimal, non-disruptive fix. Back button stays
  // mounted/rendered the whole time (stacking-only fix, never a
  // visibility/display/pointer-events hack) — it is simply covered by this
  // now-higher overlay while Shop is open, and this overlay's own backdrop
  // naturally intercepts all pointer interaction in front of it.
  return (
    <div className="pet-shopping-modal fixed inset-0 z-[80] flex items-center justify-center bg-[#2b1b12]/70 p-4 backdrop-blur-[2px] animate-in fade-in duration-200">
      <ShoppingLayout>
      <div className="pet-shopping-panel flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden border-[5px] border-[#5a351f] bg-[#fff8df] shadow-[10px_10px_0_#2f1d13]">
        <div className="pet-shop-header relative shrink-0 overflow-hidden border-b-[5px] border-[#5a351f] bg-[#f39a2e] px-5 py-4 text-[#3f291b]">
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              {selectedCategory ? (
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center border-[3px] border-[#6b4423] bg-[#fff0ad] shadow-[3px_3px_0_#6b4423] transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none"
                  aria-label="Back to categories"
                >
                  <ArrowLeft className="h-7 w-7" strokeWidth={3} />
                </button>
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center border-[3px] border-[#6b4423] bg-[#fff0ad] shadow-[3px_3px_0_#6b4423]">
                  <AiOutlineShop className="h-9 w-9" strokeWidth={10} />
                </div>
              )}
              <div className="min-w-0">
                <h2 className="truncate text-2xl font-black tracking-wide text-slate-900">
                  {selectedCategory || (shopType === 'food' ? 'Food Shop' : 'Furniture Shop')}
                </h2>
                <p className="text-sm font-bold text-orange-950/70">
                  {selectedCategory === 'Room Decor' ? 'Choose a room, then choose its furniture' : selectedCategory ? `${selectedCategory === 'Fishing Rods' ? rods.length : filteredItems.length} items available` : 'Pick a shelf, then buy supplies'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="flex items-center gap-2 border-[3px] border-[#6b4423] bg-[#fff0ad] px-3 py-1.5 text-[#3f321f] shadow-[4px_4px_0_#6b4423]">
                <PixelCoinBag />
                <span className="font-black text-xl tracking-wider">{coins}</span>
              </div>
              <button
                onClick={closeShop}
                className="flex h-11 w-11 items-center justify-center border-[3px] border-[#6b4423] bg-[#fff0ad] shadow-[3px_3px_0_#6b4423] transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none"
                aria-label="Close market"
              >
                <X className="h-7 w-7" strokeWidth={3} />
              </button>
            </div>
          </div>
        </div>

        <div key={selectedCategory || 'categories'} className="flex-1 overflow-y-auto bg-[#fff8e8] p-5 no-scrollbar">
          {isLoading && (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <div className="h-12 w-12 border-4 border-[#d6b47a] border-t-[#7b3517] animate-spin" />
              <p className="text-lg font-black text-orange-600">Loading items...</p>
            </div>
          )}

          {!isLoading && !selectedCategory && (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {categories.map((cat) => {
                const style = CATEGORY_STYLES[cat] || CATEGORY_STYLES.Default;
                const categoryItems = items.filter(item => item.category === cat);
                const Icon = CATEGORY_ICONS[cat] || CATEGORY_ICONS.Default;
                const itemCount = cat === 'Room Decor' ? DECOR_ITEMS.length + CABINET_ITEMS.length : cat === 'Fishing Rods' ? rods.length : categoryItems.length;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`group relative min-h-40 overflow-hidden border-[3px] ${style.border} ${style.bg} p-5 text-left shadow-[5px_5px_0_#76523a] transition-transform hover:-translate-y-1 active:translate-x-1 active:translate-y-1 active:shadow-none`}
                  >
                    <div className={`pointer-events-none absolute -right-6 -top-8 h-28 w-28 ${style.accent} opacity-60 transition-transform duration-300 group-hover:scale-110`} />
                    <div className="relative z-10 flex h-full flex-col justify-between gap-7">
                      <div className="flex items-start justify-between gap-3">
                        <div className={`flex h-14 w-14 items-center justify-center border-2 border-current ${style.accent}`}>
                          <Icon className={`h-8 w-8 ${style.text}`} strokeWidth={2.2} />
                        </div>
                        <span className="border-2 border-[#8b725e] bg-[#fffdf4] px-3 py-1 text-xs font-black text-slate-600 shadow-[2px_2px_0_#8b725e]">
                          {itemCount} items
                        </span>
                      </div>
                      <div>
                        <div className={`pet-shop-category-label text-2xl font-black uppercase tracking-wide ${style.text}`}>{cat}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {!isLoading && selectedCategory === 'Room Decor' && <RoomDecorCatalog coins={coins}/> }

          {!isLoading && selectedCategory === 'Fishing Rods' && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {rods.map((rod,index)=>{
                const price=(index+1)*1000;
                const owned=(inventory[rod.id]||0)>0;
                return <div key={rod.id} className="flex flex-col border-[3px] border-sky-200 bg-white p-4 text-center shadow-[5px_5px_0_#76523a]">
                  <img src={rod.image} alt={rod.label} className="h-32 w-full object-contain" draggable={false}/>
                  <div className="mt-3 font-black text-slate-700">{rod.label}</div>
                  <div className="my-3 text-sm font-bold text-sky-700">{['Uncommon','Rare','Epic','Legendary'][index]}</div>
                  <button disabled={owned||closing} onClick={()=>{
                    if(owned||closing)return;
                    if(coins<price){say('insufficient');return;}
                    if(buyItem(rod.id,price))say('purchase');
                  }}
                    className={`mt-auto px-3 py-2.5 text-sm font-black ${owned?SHOP_BUTTONS.active:coins>=price?SHOP_BUTTONS.buy:SHOP_BUTTONS.disabled}`}>
                    {owned?'Owned':<span className="inline-flex items-center gap-2"><PixelCoinBag/>{price.toLocaleString('en-US')}</span>}
                  </button>
                </div>;
              })}
            </div>
          )}

          {!isLoading && selectedCategory && selectedCategory !== 'Room Decor' && selectedCategory !== 'Fishing Rods' && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {filteredItems.map((item) => {
                const toy = findToyByShopItem(item);
                const isToy = !!toy;
                const toyId = toy?.id || item.id;
                const ownedCount = isToy ? Math.min(1, inventory[toyId] || inventory[item.id] || 0) : inventory[item.id] || 0;
                const isActiveToy = isToy && activeBallId === toyId;
                const isOwnedToy = isToy && (ownedCount > 0 || item.price === 0);
                const isLocked = (item.levelReq || 1) > currentLevel;
                const actualPrice = item.price * currencyRate;
                const canAfford = coins >= actualPrice;
                const isDisabled = isLocked || closing;

                return (
                  <div
                    key={item.id}
                    className={`relative flex min-h-56 flex-col border-[3px] ${selectedStyle.border} bg-white p-4 text-center shadow-[5px_5px_0_#76523a] transition-transform ${
                      isLocked ? 'opacity-65 grayscale' : 'hover:-translate-y-1'
                    }`}
                  >
                    {ownedCount > 0 && !isLocked && !isToy && (
                      <div className="absolute right-3 top-3 z-10 border-2 border-emerald-800 bg-emerald-500 px-2.5 py-1 text-[11px] font-black text-white shadow-[2px_2px_0_#166534]">
                        x{ownedCount}
                      </div>
                    )}
                    {isOwnedToy && !isLocked && (
                      <div className="absolute right-3 top-3 z-10 border-2 border-emerald-800 bg-emerald-500 px-2.5 py-1 text-[11px] font-black text-white shadow-[2px_2px_0_#166534]">
                        Owned
                      </div>
                    )}

                    {isLocked && (
                      <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/55">
                        <div className="flex items-center gap-1 border-2 border-slate-950 bg-slate-800 px-3 py-1 text-xs font-black text-white shadow-[3px_3px_0_#334155]">
                          <Lock className="h-3.5 w-3.5" strokeWidth={3} />
                          Lvl {item.levelReq}
                        </div>
                      </div>
                    )}

                    <div className="mt-2 flex h-20 items-center justify-center">
                      <ToyVisual item={item} />
                    </div>
                    <div className="mt-3 truncate text-base font-black text-slate-700">{item.label}</div>

                    <div className="my-3 flex min-h-8 flex-wrap items-center justify-center gap-2">
                      {item.hunger > 0 && (
                        <span className="inline-flex items-center gap-1 border-2 border-orange-200 bg-orange-50 px-2 py-1 text-xs font-black text-orange-700">
                          <Utensils className="h-3.5 w-3.5" strokeWidth={2.8} />
                          +{item.hunger}%
                        </span>
                      )}
                      {!!item.happiness && item.happiness > 0 && (
                        <span className="inline-flex items-center gap-1 border-2 border-pink-200 bg-pink-50 px-2 py-1 text-xs font-black text-pink-700">
                          <Smile className="h-3.5 w-3.5" strokeWidth={2.8} />
                          +{item.happiness}%
                        </span>
                      )}
                    </div>

                    {isToy && isOwnedToy ? (
                      <button
                        onClick={() => !isActiveToy && onSelectToy(toyId)}
                        disabled={isActiveToy || closing}
                        className={`mt-auto px-3 py-2.5 text-sm font-black uppercase tracking-[0.08em] transition-all ${
                          isActiveToy
                            ? SHOP_BUTTONS.active
                            : SHOP_BUTTONS.select
                        }`}
                      >
                        {isActiveToy ? 'Active' : 'Select'}
                      </button>
                    ) : (
                      <button
                        onClick={async () => {
                          if (isDisabled) return;
                          if (!canAfford) { say('insufficient'); return; }
                          if (await (isToy ? onBuyToy(item) : onBuy(item)) === true) say('purchase');
                        }}
                        disabled={isDisabled}
                        className={`mt-auto px-3 py-2.5 text-sm font-black uppercase tracking-[0.08em] transition-all ${
                          isLocked
                            ? SHOP_BUTTONS.locked
                            : canAfford
                              ? SHOP_BUTTONS.buy
                              : SHOP_BUTTONS.disabled
                        }`}
                      >
                        {isLocked ? 'Locked' : (
                          <span className="inline-flex items-center justify-center gap-2" aria-label={`${formatPrice(item.price)} coins`}>
                            <PixelCoinBag />
                            <span>{formatPrice(item.price)}</span>
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      </ShoppingLayout>
    </div>
  );
};

export default ShopModal;
