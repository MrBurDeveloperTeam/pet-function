import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shopSource = readFileSync(
  new URL('../src/pet/internal/components/ShopModal.tsx', import.meta.url),
  'utf8',
);
const coinSource = readFileSync(
  new URL('../src/pet/internal/components/CoinIndicator.tsx', import.meta.url),
  'utf8',
);

test('shop reuses the shared pixel coin bag and hard-edged pixel chrome', () => {
  assert.match(coinSource, /export const PixelCoinBag/);
  assert.match(shopSource, /import \{ PixelCoinBag \} from '\.\/CoinIndicator'/);
  assert.match(shopSource, /<PixelCoinBag \/>/);
  assert.match(shopSource, /border-\[5px\] border-\[#5a351f\]/);
  assert.match(shopSource, /shadow-\[10px_10px_0_#2f1d13\]/);
  assert.match(shopSource, /uppercase tracking-\[0\.08em\]/);
  assert.doesNotMatch(shopSource, /💰/);
  assert.doesNotMatch(shopSource, /rounded-\[30px\]/);
});
