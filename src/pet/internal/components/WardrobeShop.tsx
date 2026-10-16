import { useState } from 'react';
import { Check, Gem, Shirt } from 'lucide-react';
import { useGameState } from '../../runtime/SharedPetRuntime';
import { WARDROBE_ITEMS, WARDROBE_BY_ID, wardrobeJewelryIconUrl, tryOnWardrobeItem, clearWardrobePreviewSlot, type CatOutfit, type WardrobeSlot } from '../wardrobe.mjs';
import { getPetOption } from '../petOptions';
import { PixelShopDialog } from './PixelShopDialog';
import Pet from './Pet';
import { WardrobeClothingIcon } from './WardrobeClothingIcon';
import { useShopDialogue } from './ShopDialogue';

export function WardrobeShop({ mode, onClose }: { mode: 'jewelry' | 'clothes' | 'wardrobe'; onClose: () => void }) {
  const { wardrobe, petName, stats, hasAdoptedPet, assetUrls } = useGameState();
  const { say, closing } = useShopDialogue();
  const [tab, setTab] = useState<WardrobeSlot>(mode === 'jewelry' ? 'neck' : 'body');
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [tryOn, setTryOn] = useState<Record<string, CatOutfit>>({});
  const slot: WardrobeSlot = mode === 'wardrobe' ? tab : mode === 'jewelry' ? 'neck' : 'body';
  const pet = getPetOption(petName, assetUrls?.spriteSheets);
  const equipped = wardrobe.state.outfits[pet.id] ?? {};
  const preview = tryOn[pet.id] ?? {};
  const previewOutfit = { ...equipped, ...preview };
  const dirtyPreview = (['body', 'neck'] as const).some(slot => preview[slot] !== undefined && preview[slot] !== equipped[slot]);
  const showOwnedOnly = mode === 'wardrobe' || ownedOnly;
  const items = WARDROBE_ITEMS.filter(item => item.slot === slot && (!showOwnedOnly || wardrobe.state.owned.includes(item.id)));
  const canChange = wardrobe.status === 'ready' && !wardrobe.pending && hasAdoptedPet && !closing;

  const action = async (id: string) => {
    if (!canChange) return;
    const item = WARDROBE_BY_ID[id];
    if (!item || item.slot !== slot) return;
    if (!wardrobe.state.owned.includes(id)) {
      if (mode === 'wardrobe') return;
      if (stats.coins < item.price) {
        say('insufficient');
        return;
      }
      if (await wardrobe.purchase(id) === true) say('purchase');
    } else {
      const remove = equipped[item.slot] === id;
      if (await wardrobe.equip(pet.id, item.slot, remove ? null : id)) {
        setTryOn(previous => ({ ...previous, [pet.id]: clearWardrobePreviewSlot(previous[pet.id] ?? {}, item.slot, preview[item.slot]) }));
      }
    }
  };

  return <PixelShopDialog shopkeeper={mode !== 'wardrobe'} title={mode === 'jewelry' ? 'Jewelry Shop' : mode === 'clothes' ? 'Clothing Shop' : 'My Wardrobe'} subtitle="Mix a little sparkle with your own style" coins={stats.coins} onClose={onClose}>
    <div className="pet-wardrobe-scroll">
      <div className="pet-wardrobe-layout">
        <aside className="pet-wardrobe-preview" aria-label="Outfit preview">
          <p className="pet-wardrobe-eyebrow">{dirtyPreview ? 'TRYING ON · NOT SAVED' : 'SAVED OUTFIT'}</p>
          <div className="pet-wardrobe-stage">
            <Pet {...pet} petId={pet.id} outfit={previewOutfit} stats={stats} isSleeping={false} isEating={false} isPlaying={false} displayScale={.9} pose="idle" showDirtyEffects={false} onClick={() => undefined}/>
          </div>
          <h3>{pet.label}</h3>
          {dirtyPreview && <button type="button" disabled={closing} className="pet-wardrobe-link" onClick={() => setTryOn(previous => ({ ...previous, [pet.id]: {} }))}>Show saved outfit</button>}
        </aside>
        <div className="pet-wardrobe-catalog">
          <div className="pet-wardrobe-filters">
            <div className="pet-wardrobe-choices" aria-label="Item category">
              {mode !== 'jewelry' && <button type="button" disabled={closing} aria-pressed={slot === 'body'} onClick={() => setTab('body')}><Shirt size={18}/>Clothes</button>}
              {mode !== 'clothes' && <button type="button" disabled={closing} aria-pressed={slot === 'neck'} onClick={() => setTab('neck')}><Gem size={18}/>Jewelry</button>}
            </div>
            {mode !== 'wardrobe' && <button type="button" disabled={closing} className="pet-wardrobe-owned-filter" aria-pressed={ownedOnly} onClick={() => setOwnedOnly(value => !value)}>{ownedOnly ? 'Owned only' : 'All items'}</button>}
          </div>
          {wardrobe.status === 'loading' && <p role="status">Loading your wardrobe…</p>}
          {wardrobe.error && <div className="pet-wardrobe-error" role="alert"><p>{wardrobe.error}</p><button type="button" disabled={wardrobe.pending || closing} onClick={() => void wardrobe.reload()}>Retry</button></div>}
          {!hasAdoptedPet && <p>Adopt a cat before purchasing outfits.</p>}
          <div className="pet-wardrobe-grid">
            {items.map(item => {
              const owned = wardrobe.state.owned.includes(item.id), wearing = equipped[item.slot] === item.id;
              const affordable = stats.coins >= item.price;
              return <article key={item.id} className="pet-wardrobe-card">
                <button type="button" disabled={closing} className="pet-wardrobe-try" aria-label={`Try on ${item.label}`} aria-pressed={preview[item.slot] === item.id} onClick={() => setTryOn(previous => ({ ...previous, [pet.id]: tryOnWardrobeItem(previous[pet.id] ?? {}, item.id) }))}>
                  {item.slot === 'neck' ? <img className="pet-wardrobe-jewelry-icon" src={wardrobeJewelryIconUrl(item.id)} alt=""/> : <WardrobeClothingIcon itemId={item.id}/>}
                  <span>Try on</span>
                </button>
                <h3>{item.label}</h3>
                <p className="pet-wardrobe-item-status">{wearing ? <><Check size={15}/>Wearing</> : owned ? 'Owned · all cats' : `${item.price.toLocaleString()} coins`}</p>
                <button type="button" className={`pet-wardrobe-action ${owned ? 'pet-wardrobe-action-owned' : ''}`} style={!owned && !affordable ? { opacity: .5 } : undefined} disabled={!canChange} onClick={() => void action(item.id)}>
                  {wardrobe.pending ? 'Saving…' : wearing ? 'Remove' : owned ? 'Wear' : affordable ? `Buy · ${item.price.toLocaleString()}` : 'Not enough coins'}
                </button>
              </article>;
            })}
          </div>
          {items.length === 0 && <div className="pet-wardrobe-empty"><p>No {slot === 'body' ? 'clothes' : 'jewelry'} owned yet.</p>{mode !== 'wardrobe' && <button type="button" disabled={closing} onClick={() => setOwnedOnly(false)}>Browse items</button>}</div>}
        </div>
      </div>
    </div>
  </PixelShopDialog>;
}
