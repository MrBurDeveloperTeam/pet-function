import { validateWardrobe, WARDROBE_BY_ID, WARDROBE_PET_IDS } from '../../pet/internal/wardrobe.mjs';
export function createWardrobeCloud(client) {
  const call = async (userId, name, args) => {
    if (!userId) throw Error('Sign in to use your wardrobe');
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  };
  return {
    async loadWardrobe(userId) { return validateWardrobe(await call(userId, 'pet_wardrobe_get')); },
    async purchaseWardrobeItem(userId, itemId) {
      if (!Object.hasOwn(WARDROBE_BY_ID, itemId)) throw Error('Unknown wardrobe item');
      const receipt = await call(userId, 'pet_wardrobe_purchase', { p_item_id: itemId });
      const wardrobe = validateWardrobe(receipt?.wardrobe);
      if (!wardrobe.owned.includes(itemId) || !Number.isSafeInteger(receipt?.coins) || receipt.coins < 0) throw Error('Invalid wardrobe purchase receipt');
      return { wardrobe, coins: receipt.coins };
    },
    async equipWardrobeItem(userId, petId, slot, itemId) {
      if (!WARDROBE_PET_IDS.includes(petId) || !['body', 'neck'].includes(slot) || (itemId !== null && WARDROBE_BY_ID[itemId]?.slot !== slot)) throw Error('Invalid outfit');
      const wardrobe = validateWardrobe(await call(userId, 'pet_wardrobe_equip', { p_pet_id: petId, p_slot: slot, p_item_id: itemId }));
      if ((wardrobe.outfits[petId]?.[slot] ?? null) !== itemId) throw Error('Outfit was not saved');
      return wardrobe;
    },
  };
}
