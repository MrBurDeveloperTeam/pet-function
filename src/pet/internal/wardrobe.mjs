export const WARDROBE_PET_IDS = ['mallow', 'silverbelt', 'fastrat', 'gulu', 'munchkin', 'mochi'];
export const WARDROBE_ITEMS = [
  { id: 'ruby_bell_collar', label: 'Ruby Bell Collar', slot: 'neck', price: 500, color: '#cf3e43', accent: '#ffdc72' },
  { id: 'pearl_necklace', label: 'Pearl Necklace', slot: 'neck', price: 900, color: '#fff0c8', accent: '#e4aeca' },
  { id: 'moon_pendant', label: 'Moon Pendant', slot: 'neck', price: 1500, color: '#657fca', accent: '#ffdf80' },
  { id: 'sapphire_bow', label: 'Sapphire Bow', slot: 'neck', price: 2200, color: '#4778c3', accent: '#a7edf0' },
  { id: 'sky_sailor', label: 'Sky Sailor', slot: 'body', price: 1200, color: '#e5f1ec', accent: '#3684b6' },
  { id: 'rose_knit', label: 'Rose Knit', slot: 'body', price: 1800, color: '#dd7290', accent: '#ffd9bb' },
  { id: 'forest_vest', label: 'Forest Vest', slot: 'body', price: 2400, color: '#537e65', accent: '#e8c681' },
  { id: 'royal_cape', label: 'Royal Cape', slot: 'body', price: 3200, color: '#9056a0', accent: '#f6d06c' },
];
export const WARDROBE_BY_ID = Object.fromEntries(WARDROBE_ITEMS.map(item => [item.id, item]));
export const emptyWardrobe = () => ({ owned: [], outfits: {} });

export function validateWardrobe(value) {
  if (!value || !Array.isArray(value.owned) || !value.outfits || typeof value.outfits !== 'object' || Array.isArray(value.outfits)) throw Error('Invalid wardrobe save');
  if (new Set(value.owned).size !== value.owned.length || value.owned.some(id => !Object.hasOwn(WARDROBE_BY_ID, id))) throw Error('Invalid wardrobe ownership');
  const outfits = {};
  for (const [petId, outfit] of Object.entries(value.outfits)) {
    if (!WARDROBE_PET_IDS.includes(petId) || !outfit || typeof outfit !== 'object' || Array.isArray(outfit)) throw Error('Invalid cat outfit');
    outfits[petId] = {};
    for (const [slot, itemId] of Object.entries(outfit)) {
      if (!['body', 'neck'].includes(slot) || !value.owned.includes(itemId) || WARDROBE_BY_ID[itemId]?.slot !== slot) throw Error('Invalid equipped item');
      outfits[petId][slot] = itemId;
    }
  }
  return { owned: [...value.owned], outfits };
}

export function equipWardrobe(state, petId, slot, itemId) {
  const next = validateWardrobe(state);
  if (!WARDROBE_PET_IDS.includes(petId) || !['body', 'neck'].includes(slot)) throw Error('Invalid outfit slot');
  if (itemId !== null && (!next.owned.includes(itemId) || WARDROBE_BY_ID[itemId]?.slot !== slot)) throw Error('Buy this item before wearing it');
  const outfit = { ...next.outfits[petId] };
  if (itemId === null) delete outfit[slot]; else outfit[slot] = itemId;
  next.outfits[petId] = outfit;
  return next;
}

export function tryOnWardrobeItem(preview, itemId) {
  const item = Object.hasOwn(WARDROBE_BY_ID, itemId) ? WARDROBE_BY_ID[itemId] : null;
  if (!item) throw Error('Unknown wardrobe item');
  return { ...preview, [item.slot]: item.id };
}

// A confirmed save clears only its own draft. A newer selection made while
// that request was pending must remain visible.
export function clearWardrobePreviewSlot(preview, slot, submittedItemId) {
  if (preview[slot] !== submittedItemId) return preview;
  const next = { ...preview };
  delete next[slot];
  return next;
}

// Every garment uses a pose-fitted version of the same independent accessory
// art, so selecting a body never bakes in the player's neck-slot choice.
const clothingNeckProfiles = { rose_knit: 'rose_knit' };
const expandedClothes = ['sky_sailor', 'forest_vest', 'royal_cape'];
export const wardrobeJewelrySpriteUrl = (petId, itemId, body) =>
  expandedClothes.includes(body)
    ? `/pet-function/wardrobe/clothing-v1/jewelry/${petId}/${body}/${itemId}.webp`
    : `/pet-function/wardrobe/jewelry-v3/${petId}/${clothingNeckProfiles[body] ?? 'original'}/${itemId}.webp`;

export const wardrobeJewelryIconUrl = itemId => `/pet-function/wardrobe/jewelry-v3/icons/${itemId}.webp`;

// Every current clothing item has a complete, reviewed cat atlas.
export function wardrobeCatSpriteUrl(petId, itemId) {
  if (!WARDROBE_PET_IDS.includes(petId)) return null;
  if (itemId === 'rose_knit') return `/pet-function/wardrobe/${petId === 'mallow' ? 'baked-v3' : 'baked-v2'}/${petId}-rose-knit.webp`;
  return expandedClothes.includes(itemId)
    ? `/pet-function/wardrobe/clothing-v1/${petId}-${itemId.replaceAll('_', '-')}.webp`
    : null;
}

export function petAppearanceLayers(petId, outfit, originalSpriteUrl) {
  const body = WARDROBE_BY_ID[outfit?.body]?.slot === 'body' ? outfit.body : null;
  const neck = WARDROBE_BY_ID[outfit?.neck]?.slot === 'neck' ? outfit.neck : null;
  const dressed = body ? wardrobeCatSpriteUrl(petId, body) : null;
  const neutral = neck && ['silverbelt', 'munchkin'].includes(petId)
    ? `/pet-function/wardrobe/jewelry-v3/neutral/${petId}.webp`
    : originalSpriteUrl;
  return [
    dressed ?? neutral,
    ...(neck ? [wardrobeJewelrySpriteUrl(petId, neck, body)] : []),
  ];
}
