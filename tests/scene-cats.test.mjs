import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const RoomType = Object.fromEntries(['KART_TRACK', 'TOWN_HOME', 'SHOPPING_STREET', 'SPORTS_STADIUM'].map(key => [key, key]));
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/pet/internal/sceneCats.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports, require: () => ({ RoomType }) });
const { SCENE_CATS, sampleSceneCat } = exports;

test('each marked location has the requested seated or standing cat, shopping uses all six appearances', () => {
  assert.deepEqual(Object.values(SCENE_CATS).map(cats => cats.length), [2, 3, 6, 2]);
  assert.equal(new Set(SCENE_CATS.SHOPPING_STREET.map(cat => cat.pet)).size, 6);
  for (const cats of Object.values(SCENE_CATS)) {
    for (const cat of cats) {
      assert.ok(cat.position.x > 0 && cat.position.x < 1);
      assert.ok(cat.position.y > 0 && cat.position.y < 1);
      if (cat.id.includes('bench')) assert.equal(cat.pose, 'sit');
    }
  }
});

test('walkers reach both endpoints, pause, turn, and return continuously', () => {
  const cat = { pose: 'walk', position: { x: .2, y: .6 }, path: [{ x: .2, y: .6 }, { x: .3, y: .6 }], speed: 18.62 };
  assert.ok(Math.abs(sampleSceneCat(cat, 5).x - .25) < 1e-8);
  assert.equal(sampleSceneCat(cat, 11).walking, false);
  assert.ok(Math.abs(sampleSceneCat(cat, 11).x - .3) < 1e-8);
  assert.equal(sampleSceneCat(cat, 13).direction, -1);
  assert.ok(Math.abs(sampleSceneCat(cat, 17).x - .25) < 1e-8);
  assert.equal(sampleSceneCat(cat, 23).walking, false);
  assert.ok(Math.abs(sampleSceneCat(cat, 24).x - .2) < 1e-8);
});

test('scene inhabitants keep their anchors and walkers remain on their authored shopping paths', () => {
  for (const cats of Object.values(SCENE_CATS)) {
    for (const cat of cats) {
      for (let seconds = 0; seconds < 120; seconds += .1) {
        const state = sampleSceneCat(cat, seconds);
        if (cat.pose !== 'walk') {
          assert.equal(state.x, cat.position.x);
          assert.equal(state.y, cat.position.y);
          assert.equal(state.walking, false);
        } else {
          const [start, end] = cat.path;
          assert.ok(state.x >= Math.min(start.x, end.x) - 1e-8 && state.x <= Math.max(start.x, end.x) + 1e-8);
          assert.ok(state.y >= Math.min(start.y, end.y) - 1e-8 && state.y <= Math.max(start.y, end.y) + 1e-8);
        }
      }
    }
  }
});
