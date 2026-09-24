import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const sourceUrl = new URL('../src/pet/internal/components/FoodItemVisual.tsx', import.meta.url);
const source = readFileSync(sourceUrl, 'utf8');

test('shop item images use stable public URLs and every referenced file is shipped', () => {
  assert.match(source, /`\/pet-function\/items\/\$\{fileName\}`/);
  assert.doesNotMatch(source, /import\s+\w+PixelUrl\s+from/);

  const fileNames = [...source.matchAll(/itemAssetUrl\('([^']+)'\)/g)].map((match) => match[1]);
  assert.ok(fileNames.length >= 50, 'expected the complete shared pixel item catalog');

  for (const fileName of fileNames) {
    const publicUrl = new URL(`../public/pet-function/items/${fileName}`, import.meta.url);
    assert.equal(existsSync(fileURLToPath(publicUrl)), true, `missing public shop image: ${fileName}`);
  }
});
