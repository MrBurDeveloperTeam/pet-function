import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { emptyWardrobe, equipWardrobe, validateWardrobe, tryOnWardrobeItem, clearWardrobePreviewSlot, WARDROBE_ITEMS, WARDROBE_PET_IDS, wardrobeJewelrySpriteUrl, wardrobeCatSpriteUrl, petAppearanceLayers } from '../src/pet/internal/wardrobe.mjs';
import { createWardrobeCloud } from '../src/apps/repositories/wardrobeCloud.mjs';
import { createSpriteTextureCache } from '../src/pet/internal/spriteTextureCache.mjs';

test('every cosmetic resolves to its current transparent runtime atlas for all six cats', () => {
  assert.equal(WARDROBE_ITEMS.length, 8);
  for (const pet of WARDROBE_PET_IDS) for (const item of WARDROBE_ITEMS) {
    const url = item.slot === 'body' ? wardrobeCatSpriteUrl(pet, item.id) : wardrobeJewelrySpriteUrl(pet, item.id);
    const bytes = readFileSync(new URL('../public' + url, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', url);
    assert.equal(bytes.toString('ascii', 12, 16), 'VP8L', url);
    const dimensions = bytes.readUInt32LE(21);
    assert.equal((dimensions & 0x3fff) + 1, 1536, url);
    assert.equal(((dimensions >>> 14) & 0x3fff) + 1, 2080, url);
    assert.ok(dimensions & (1 << 28), `${url}: transparency required`);
  }
});

test('neck and clothing combine, save per cat, and remove without losing ownership', () => {
  const original = { owned: ['rose_knit', 'moon_pendant'], outfits: {} };
  let next = equipWardrobe(original, 'mallow', 'body', 'rose_knit');
  next = equipWardrobe(next, 'mallow', 'neck', 'moon_pendant');
  next = equipWardrobe(next, 'gulu', 'body', 'rose_knit');
  assert.deepEqual(validateWardrobe(JSON.parse(JSON.stringify(next))), next);
  assert.deepEqual(original.outfits, {}, 'must not mutate the prior save');
  next = equipWardrobe(next, 'mallow', 'body', null);
  assert.deepEqual(next.outfits.mallow, { neck: 'moon_pendant' });
  assert.deepEqual(next.outfits.gulu, { body: 'rose_knit' });
  assert.equal(next.owned.length, 2);
});

test('trying clothes and jewelry in either order retains both choices over the saved outfit', () => {
  const saved = { neck: 'moon_pendant' };
  for (const order of [['ruby_bell_collar', 'rose_knit'], ['rose_knit', 'ruby_bell_collar']]) {
    let preview = {};
    for (const id of order) preview = tryOnWardrobeItem(preview, id);
    assert.deepEqual({ ...saved, ...preview }, { body: 'rose_knit', neck: 'ruby_bell_collar' });
    preview = tryOnWardrobeItem(preview, 'moon_pendant');
    preview = tryOnWardrobeItem(preview, 'sky_sailor');
    preview = tryOnWardrobeItem(preview, 'ruby_bell_collar');
    assert.deepEqual(preview, { body: 'sky_sailor', neck: 'ruby_bell_collar' });
  }
  assert.deepEqual(saved, { neck: 'moon_pendant' }, 'trying on must never change the save');
});

test('wearing or removing one slot keeps the other trial choice and preserves newer pending choices', () => {
  const draft = { body: 'rose_knit', neck: 'ruby_bell_collar' };
  const original = { owned: ['rose_knit', 'moon_pendant', 'ruby_bell_collar'], outfits: { mallow: { neck: 'moon_pendant' } } };
  for (const [slot, id] of [['body', 'rose_knit'], ['neck', 'ruby_bell_collar']]) {
    for (const target of [id, null]) {
      const confirmed = equipWardrobe(original, 'mallow', slot, target);
      const remaining = clearWardrobePreviewSlot(draft, slot, draft[slot]);
      assert.equal(remaining[slot], undefined);
      const other = slot === 'body' ? 'neck' : 'body';
      assert.equal(remaining[other], draft[other]);
      const visible = { ...confirmed.outfits.mallow, ...remaining };
      assert.equal(visible[slot], target ?? undefined);
      assert.equal(visible[other], draft[other]);
    }
  }
  const newer = tryOnWardrobeItem(draft, 'moon_pendant');
  assert.deepEqual(clearWardrobePreviewSlot(newer, 'neck', draft.neck), newer, 'late receipts cannot clear a newer trial');
  assert.deepEqual(draft, { body: 'rose_knit', neck: 'ruby_bell_collar' });
});

test('jewelry switches to the fitted knit atlas and covers every animation frame', () => {
  const counts = [6,8,8,4,5,8,6,6,6,4];
  for (const pet of WARDROBE_PET_IDS) for (const item of WARDROBE_ITEMS.filter(item => item.slot === 'neck')) {
    for (const body of [null, 'rose_knit']) {
      const url = wardrobeJewelrySpriteUrl(pet, item.id, body);
      const image = readFileSync(new URL('../public' + url, import.meta.url));
      assert.equal(image.toString('ascii', 0, 4), 'RIFF');
      assert.equal(image.toString('ascii', 12, 16), 'VP8L');
      const dimensions = image.readUInt32LE(21);
      assert.equal((dimensions & 0x3fff) + 1, 1536);
      assert.equal(((dimensions >>> 14) & 0x3fff) + 1, 2080);
      assert.ok(dimensions & (1 << 28), 'accessory must retain transparency');
      const report = JSON.parse(readFileSync(new URL('./fixtures/art/wardrobe-jewelry.json', import.meta.url)));
      const fit = report.find(entry => entry.pet === pet && entry.profile === (body || 'original'));
      for (const [row,count] of counts.entries()) for (let col=0;col<count;col++) {
        assert.ok(fit.frames.some(frame => frame.row === row && frame.col === col), `${url}: missing frame ${row}/${col}`);
      }
      const layers = petAppearanceLayers(pet, { neck: item.id, ...(body ? {body} : {}) }, '/original.webp');
      assert.equal(layers.at(-1), url);
    }
    assert.notEqual(wardrobeJewelrySpriteUrl(pet,item.id), wardrobeJewelrySpriteUrl(pet,item.id,'rose_knit'));
  }
});

test('rejects unowned equipment, wrong slots, unknown cats and malformed saves', () => {
  assert.throws(() => equipWardrobe(emptyWardrobe(), 'mallow', 'body', 'rose_knit'));
  assert.throws(() => equipWardrobe({ owned: ['rose_knit'], outfits: {} }, 'gulu', 'neck', 'rose_knit'));
  assert.throws(() => equipWardrobe(emptyWardrobe(), 'unknown', 'body', null));
  assert.throws(() => validateWardrobe({ owned: ['constructor'], outfits: {} }));
  assert.throws(() => validateWardrobe({ owned: [], outfits: { mallow: { neck: 'moon_pendant' } } }));
});

test('all current clothes and jewelry can be mixed, persisted and removed independently', () => {
  const owned = WARDROBE_ITEMS.map(item => item.id);
  const clothes = [null, ...WARDROBE_ITEMS.filter(item => item.slot === 'body').map(item => item.id)];
  for (const pet of WARDROBE_PET_IDS) for (const body of clothes) {
    for (const neck of WARDROBE_ITEMS.filter(item => item.slot === 'neck').map(item => item.id)) {
      let save = equipWardrobe({owned, outfits:{}}, pet, 'body', body);
      save = equipWardrobe(save,pet,'neck',neck);
      const restored = validateWardrobe(JSON.parse(JSON.stringify(save)));
      const layers = petAppearanceLayers(pet,restored.outfits[pet],'/original.webp');
      assert.equal(layers.at(-1),wardrobeJewelrySpriteUrl(pet,neck,body));
      assert.equal(layers.length,2);
      const withoutNeck = equipWardrobe(restored,pet,'neck',null);
      assert.equal(withoutNeck.outfits[pet].body,body || undefined);
      assert.equal(withoutNeck.owned.length,owned.length);
      assert.equal(equipWardrobe(restored,pet,'body',null).outfits[pet].neck,neck);
    }
  }
});

test('the three expanded garments have complete transparent art and fitted jewelry for every cat', () => {
  const outfits = ['sky_sailor', 'forest_vest', 'royal_cape'];
  const counts = [6,8,8,4,5,8,6,6,6,4];
  const report = JSON.parse(readFileSync(new URL('./fixtures/art/wardrobe-clothing.json', import.meta.url)));
  const art = new Set();
  const assertAtlas = url => {
    const bytes = readFileSync(new URL('../public' + url, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', url);
    assert.equal(bytes.toString('ascii', 12, 16), 'VP8L', url);
    const dimensions = bytes.readUInt32LE(21);
    assert.equal((dimensions & 0x3fff) + 1, 1536, url);
    assert.equal(((dimensions >>> 14) & 0x3fff) + 1, 2080, url);
    assert.ok(dimensions & (1 << 28), `${url}: transparent background required`);
    return bytes;
  };
  for (const pet of WARDROBE_PET_IDS) for (const outfit of outfits) {
    const url = wardrobeCatSpriteUrl(pet, outfit);
    art.add(assertAtlas(url).toString('base64'));
    const fit = report.find(entry => entry.pet === pet && entry.outfit === outfit);
    assert.equal(fit.frameCount, 61, url);
    for (const [row, count] of counts.entries()) for (let col=0; col<count; col++) {
      const frame = fit.frames.find(frame => frame.row === row && frame.col === col);
      assert.ok(frame, `${url}: missing pose ${row}/${col}`);
      assert.ok(frame.bounds[0] >= 0 && frame.bounds[1] >= 0 && frame.bounds[2] <= 192 && frame.bounds[3] <= 208, `${url}: clipped pose`);
    }
    for (const item of WARDROBE_ITEMS.filter(item => item.slot === 'neck')) {
      const neck = wardrobeJewelrySpriteUrl(pet, item.id, outfit);
      assertAtlas(neck);
      assert.deepEqual(petAppearanceLayers(pet, { body: outfit, neck: item.id }, '/original.webp'), [url, neck]);
    }
  }
  assert.equal(art.size, 18, 'every cat and garment needs distinct artwork');
});

test('cloud adapter trusts confirmed server receipts and does not send a price or owner', async () => {
  const calls = [];
  const wardrobe = { owned: ['rose_knit'], outfits: { mallow: { body: 'rose_knit' } } };
  const api = createWardrobeCloud({ rpc: async (name, args) => { calls.push({ name, args }); return { data: name === 'pet_wardrobe_purchase' ? { wardrobe, coins: 5000 } : wardrobe, error: null }; } });
  assert.deepEqual(await api.loadWardrobe('alice'), wardrobe);
  assert.equal((await api.purchaseWardrobeItem('alice', 'rose_knit')).coins, 5000);
  await api.equipWardrobeItem('alice', 'mallow', 'body', 'rose_knit');
  assert.deepEqual(calls[1].args, { p_item_id: 'rose_knit' });
  assert.deepEqual(calls[2].args, { p_pet_id: 'mallow', p_slot: 'body', p_item_id: 'rose_knit' });
  await assert.rejects(() => api.loadWardrobe(''));
});

test('cloud failure or malformed receipt never becomes a successful wardrobe purchase', async () => {
  const failure = createWardrobeCloud({ rpc: async () => ({ error: new Error('Offline') }) });
  await assert.rejects(() => failure.purchaseWardrobeItem('alice', 'rose_knit'), /Offline/);
  const bad = createWardrobeCloud({ rpc: async () => ({ data: { wardrobe: emptyWardrobe(), coins: 10 }, error: null }) });
  await assert.rejects(() => bad.purchaseWardrobeItem('alice', 'rose_knit'), /receipt/);
});

test('saved Rose Knit uses the matching complete cat, and remove restores each original', () => {
  for (const pet of WARDROBE_PET_IDS) {
    const original = `/custom-host/${pet}.webp`;
    let save = { owned: ['rose_knit', 'moon_pendant'], outfits: {} };
    assert.deepEqual(petAppearanceLayers(pet, save.outfits[pet], original), [original], 'buying alone does not dress the cat');
    save = equipWardrobe(save, pet, 'body', 'rose_knit');
    const restored = validateWardrobe(JSON.parse(JSON.stringify(save)));
    const url = wardrobeCatSpriteUrl(pet, 'rose_knit');
    assert.deepEqual(petAppearanceLayers(pet, restored.outfits[pet], original), [url]);
    const file = readFileSync(new URL('../public' + url, import.meta.url));
    assert.equal(file.toString('ascii', 0, 4), 'RIFF');
    assert.equal(file.toString('ascii', 8, 12), 'WEBP');
    save = equipWardrobe(restored, pet, 'neck', 'moon_pendant');
    assert.deepEqual(petAppearanceLayers(pet, save.outfits[pet], original), [url, wardrobeJewelrySpriteUrl(pet, 'moon_pendant', 'rose_knit')]);
    save = equipWardrobe(save, pet, 'body', null);
    const base = ['silverbelt', 'munchkin'].includes(pet)
      ? `/pet-function/wardrobe/jewelry-v3/neutral/${pet}.webp` : original;
    assert.deepEqual(petAppearanceLayers(pet, save.outfits[pet], original), [base, wardrobeJewelrySpriteUrl(pet, 'moon_pendant')]);
    if (base !== original) assert.ok(existsSync(new URL('../public' + base, import.meta.url)));
    save = equipWardrobe(save, pet, 'neck', null);
    assert.deepEqual(petAppearanceLayers(pet, save.outfits[pet], original), [original]);
  }
  assert.equal(wardrobeCatSpriteUrl('unknown', 'rose_knit'), null);
  assert.notEqual(wardrobeCatSpriteUrl('mallow', 'sky_sailor'), wardrobeCatSpriteUrl('mallow', 'rose_knit'), 'every garment uses its own complete artwork');
  assert.deepEqual(petAppearanceLayers('mallow', { body: 'sky_sailor' }, '/original.webp'), [wardrobeCatSpriteUrl('mallow', 'sky_sailor')]);
});

test('outfit images deduplicate concurrent requests and wait for decoding', async () => {
  const images = [];
  let decodeReady;
  const cache = createSpriteTextureCache(() => {
    const img = { src: '', onload: null, onerror: null, decode: () => new Promise(resolve => { decodeReady = resolve; }) };
    images.push(img); return img;
  });
  const first = cache.loadAll(['/cat.webp']);
  const second = cache.loadAll(['/cat.webp']);
  assert.equal(images.length, 1);
  images[0].onload();
  await Promise.resolve();
  assert.equal(cache.isReady(['/cat.webp']), false);
  decodeReady();
  await Promise.all([first, second]);
  assert.equal(cache.isReady(['/cat.webp']), true);
  await cache.loadAll(['/cat.webp']);
  assert.equal(images.length, 1);
});

test('one failed layer rejects the whole outfit, can retry, and stalled requests expire', async () => {
  const images = [];
  const cache = createSpriteTextureCache(() => { const img = { src: '', onload: null, onerror: null }; images.push(img); return img; }, 30);
  const pending = cache.loadAll(['/cat.webp', '/neck.svg']);
  images[0].onload(); images[1].onerror();
  await assert.rejects(pending, /could not be loaded/);
  assert.equal(cache.isReady(['/cat.webp', '/neck.svg']), false);
  const retry = cache.loadAll(['/cat.webp', '/neck.svg']);
  assert.equal(images.length, 3, 'only the failed image should reload');
  images[2].onload(); await retry;
  assert.equal(cache.isReady(['/cat.webp', '/neck.svg']), true);
  await assert.rejects(cache.loadAll(['/never-loaded.webp']), /timed out/);
  assert.equal(cache.isReady(['/never-loaded.webp']), false);
});
