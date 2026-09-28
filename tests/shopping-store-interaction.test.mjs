import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const petRoomSource = readFileSync(new URL('../src/pet/internal/PetRoom.tsx', import.meta.url), 'utf8');
const outlinesSource = readFileSync(new URL('../src/pet/internal/components/RoomInteractionOutlines.tsx', import.meta.url), 'utf8');
const shopSource = readFileSync(new URL('../src/pet/internal/components/ShopModal.tsx', import.meta.url), 'utf8');

test('shopping street storefronts own the food and furniture catalogs', () => {
  assert.match(outlinesSource, /action: 'food-shop'/);
  assert.match(outlinesSource, /action: 'furniture-shop'/);
  assert.match(petRoomSource, /setActiveShop\('food'\)/);
  assert.match(petRoomSource, /setActiveShop\('furniture'\)/);
  assert.match(shopSource, /food: \['Healthy', 'Breakfast', 'Meals', 'Drinks', 'Sweets'\]/);
  assert.match(shopSource, /furniture: \['Toys', 'Beds'\]/);
  assert.match(outlinesSource, /M592 406 V316 C592 290 607 277 624 277/);
  assert.match(outlinesSource, /M899 405 V312 C899 288 914 275 930 275/);
});

test('store modal toggles with Space and closes with Escape while the global shop button is absent', () => {
  assert.match(shopSource, /event\.key === 'Escape'/);
  assert.match(shopSource, /event\.code === 'Space'/);
  assert.match(petRoomSource, /currentRoom === RoomType\.SHOPPING_STREET/);
  assert.doesNotMatch(petRoomSource, /<BottomControls/);
  assert.doesNotMatch(petRoomSource, /onOpenShop=/);
});

test('beds are purchasable from the furniture catalog', () => {
  assert.match(shopSource, /onClick=\{\(\) => !isDisabled && onBuy\(bed\)\}/);
  assert.doesNotMatch(shopSource, />\s*Unavailable\s*</);
});
