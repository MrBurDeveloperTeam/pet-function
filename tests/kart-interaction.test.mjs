import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const load = (file, require = () => ({})) => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, require });
  return exports;
};
const kart = load('../src/pet/internal/kartInteraction.ts');
const RoomType = Object.fromEntries(['PLAYROOM', 'TOWN_HOME', 'SHOPPING_STREET', 'SPORTS_GROUND', 'SPORTS_STADIUM', 'KART_TRACK'].map(key => [key, key]));
const navigation = load('../src/pet/internal/outdoorNavigation.ts', () => ({ RoomType }));

test('Space works only at the east lamp entrance across viewport sizes', () => {
  for (const [width, height] of [[1862, 845], [1280, 720], [740, 334]]) {
    assert.equal(kart.isNearKartEntrance(.405 * width, .49 * height, width, height), true);
    for (const [x, y] of [[.414, .14], [.26, .38], [.13, .49], [.7, .55], [.405, .4], [.405, .6]]) {
      assert.equal(kart.isNearKartEntrance(x * width, y * height, width, height), false);
    }
  }
  assert.equal(kart.isNearKartEntrance(0, 0, 0, 0), false);
});

test('the entrance remains walkable from both outdoor arrival paths', () => {
  const width = 1862, height = 845;
  const destination = { x: kart.KART_ENTRANCE.x * width, y: kart.KART_ENTRANCE.y * height };
  for (const initial of [{ x: .414, y: .14 }, { x: .13, y: .49 }]) {
    const start = { x: initial.x * width, y: initial.y * height };
    const constrained = navigation.constrainOutdoorPosition(RoomType.KART_TRACK, start, destination, width, height);
    assert.ok(Math.hypot(constrained.x - destination.x, constrained.y - destination.y) < .01);
    const path = navigation.getOutdoorWalkPath(RoomType.KART_TRACK, start, destination, width, height);
    assert.ok(path.length > 0);
    assert.ok(Math.hypot(path.at(-1).x - destination.x, path.at(-1).y - destination.y) < .01);
  }
});

test('the circuit includes both garden cutouts and keyboard activation cannot bypass proximity', () => {
  assert.equal((kart.KART_CIRCUIT_OUTLINE.match(/\bM\s/g) || []).length, 3);
  const outlines = readFileSync(new URL('../src/pet/internal/components/RoomInteractionOutlines.tsx', import.meta.url), 'utf8');
  const room = readFileSync(new URL('../src/pet/internal/PetRoom.tsx', import.meta.url), 'utf8');
  assert.match(outlines, /fillRule="evenodd"/);
  assert.match(outlines, /\(onKeyboardActivate \|\| onActivate\)\(action\)/);
  assert.match(room, /onKeyboardActivate=\{currentRoom === RoomType.KART_TRACK \? \(\) => activateKartFromEntrance\(\)/);
});
