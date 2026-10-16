export type ShopDialogueKind = 'welcome' | 'insufficient' | 'purchase' | 'farewell';
export const SHOP_DIALOGUE_POOLS: Readonly<Record<ShopDialogueKind, readonly string[]>>;
export function createShopDialoguePicker(random?: () => number): (kind: ShopDialogueKind) => string;
