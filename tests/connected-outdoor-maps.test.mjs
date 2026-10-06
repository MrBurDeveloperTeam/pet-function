import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const petRoomSource = readFileSync(new URL('../src/pet/internal/PetRoom.tsx', import.meta.url), 'utf8');
const typesSource = readFileSync(new URL('../src/pet/internal/types.ts', import.meta.url), 'utf8');
const backgroundsSource = readFileSync(new URL('../src/pet/internal/roomBackgrounds.ts', import.meta.url), 'utf8');
const navigationSource = readFileSync(new URL('../src/pet/internal/outdoorNavigation.ts', import.meta.url), 'utf8');
const RoomType = Object.fromEntries(['PLAYROOM', 'TOWN_HOME', 'SHOPPING_STREET', 'SPORTS_GROUND', 'SPORTS_STADIUM', 'KART_TRACK'].map((room) => [room, room]));
const navigation = {};
vm.runInNewContext(ts.transpileModule(navigationSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: navigation, require: () => ({ RoomType }) });

test('town, shopping, sports and karting form the connected outdoor route', () => {
  assert.match(typesSource, /TOWN_HOME = 'TOWN_HOME'/);
  assert.match(typesSource, /SHOPPING_STREET = 'SHOPPING_STREET'/);
  assert.match(typesSource, /SPORTS_GROUND = 'SPORTS_GROUND'/);
  assert.match(typesSource, /SPORTS_STADIUM = 'SPORTS_STADIUM'/);
  assert.match(typesSource, /KART_TRACK = 'KART_TRACK'/);
  assert.match(petRoomSource, /RoomType\.GAMES[\s\S]*?destination: RoomType\.TOWN_HOME/);
  assert.match(petRoomSource, /RoomType\.TOWN_HOME[\s\S]*?direction: 'left', destination: RoomType\.SHOPPING_STREET/);
  assert.match(petRoomSource, /RoomType\.SHOPPING_STREET[\s\S]*?direction: 'down', destination: RoomType\.SPORTS_GROUND/);
  assert.match(petRoomSource, /RoomType\.SPORTS_GROUND[\s\S]*?direction: 'up', destination: RoomType\.SHOPPING_STREET/);
  assert.match(petRoomSource, /RoomType\.TOWN_HOME[\s\S]*?direction: 'down', destination: RoomType\.KART_TRACK/);
  assert.match(petRoomSource, /RoomType\.SPORTS_GROUND[\s\S]*?direction: 'right', destination: RoomType\.KART_TRACK/);
  assert.match(petRoomSource, /RoomType\.KART_TRACK[\s\S]*?direction: 'up', destination: RoomType\.TOWN_HOME/);
  assert.match(petRoomSource, /RoomType\.KART_TRACK[\s\S]*?direction: 'left', destination: RoomType\.SPORTS_GROUND/);
  assert.match(petRoomSource, /RoomType\.SPORTS_STADIUM[\s\S]*?direction: 'down', destination: RoomType\.SPORTS_GROUND/);
});

test('all connected outdoor scenes use their generated backgrounds', () => {
  assert.match(backgroundsSource, /town-home-kart\.png/);
  assert.match(backgroundsSource, /shopping-street\.png/);
  assert.match(backgroundsSource, /sports-ground-kart\.png/);
  assert.match(backgroundsSource, /karting-track\.png/);
  assert.match(backgroundsSource, /sports-stadium\.png/);
});

test('keyboard and pointer movement share authored outdoor collision constraints', () => {
  assert.match(navigationSource, /\[RoomType\.TOWN_HOME\]/);
  assert.match(navigationSource, /\[RoomType\.SHOPPING_STREET\]/);
  assert.match(navigationSource, /\[RoomType\.SPORTS_GROUND\]/);
  assert.match(navigationSource, /\[RoomType\.SPORTS_STADIUM\]/);
  assert.match(navigationSource, /\[RoomType\.KART_TRACK\]/);
  assert.match(petRoomSource, /outsidePointerTargetRef\.current = constrainOutdoorPosition/);
  assert.match(petRoomSource, /const next = constrainOutdoorPosition\(currentRoom, current, requestedNext/);
  assert.match(petRoomSource, /'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's'/);
});

test('town scenes use half-size cats and a collapsible top status control', () => {
  assert.match(petRoomSource, /const TOWN_PET_SCALE = OUTSIDE_PET_SCALE \* 0\.5/);
  assert.match(petRoomSource, /displayScale=\{getOutdoorPetScale\(currentRoom\)\}/);
  assert.match(petRoomSource, /aria-label=\{showTownStats \? 'Hide pet status' : 'Show pet status'\}/);
  assert.match(petRoomSource, /showTownStats && <StatsBar stats=\{stats\}/);
  assert.match(petRoomSource, /const PixelStatsToggle/);
  assert.match(petRoomSource, /<PixelStatsToggle expanded=\{showTownStats\}/);
  assert.match(petRoomSource, /h-8 w-8/);
});

test('reaching a town road edge automatically changes scene while exit arrows remain clickable', () => {
  assert.match(petRoomSource, /const AUTO_TOWN_EXIT_ROOMS = new Set<RoomType>/);
  assert.match(petRoomSource, /AUTO_TOWN_EXIT_ROOMS\.has\(currentRoom\)/);
  assert.match(petRoomSource, /startRoomTransition\(nearbyExit\)/);
  assert.doesNotMatch(petRoomSource, /event\.code === 'Space' && TOWN_ROOMS\.has\(currentRoom\)/);
  assert.match(petRoomSource, /onClick=\{\(\) => startRoomTransition\(exit\)\}/);
  assert.match(petRoomSource, /sportsTopExitY = \(\(208 \* getOutdoorPetScale\(currentRoom\)\) \/ 2\) \/ Math\.max\(rect\.height, 1\) \+ 0\.015/);
  assert.match(petRoomSource, /isMovingTowardSportsExit = outsideMovementKeysRef\.current\.up/);
  assert.match(petRoomSource, /isMovingTowardSportsExit && y <= sportsTopExitY/);
  assert.match(petRoomSource, /currentRoom === RoomType\.TOWN_HOME && exit\.destination === RoomType\.KART_TRACK/);
  assert.match(petRoomSource, /currentRoom === RoomType\.SPORTS_GROUND && exit\.destination === RoomType\.KART_TRACK/);
  assert.match(petRoomSource, /currentRoom === RoomType\.KART_TRACK && exit\.destination === RoomType\.SPORTS_GROUND/);
});

test('sports ground uses one approach with a karting fork and the stadium has a navigable pitch and track', () => {
  assert.match(petRoomSource, /isSportsGroundReturn/);
  assert.match(petRoomSource, /left-\[39%\] top-8/);
  assert.match(navigationSource, /\{ x: 0\.525, y: 0\.235 \}, \{ x: 0\.475, y: 0\.235 \}/);
  assert.match(navigationSource, /RoomType\.SPORTS_GROUND\]: \{ x: 0\.5, y: 0\.18 \}/);
  assert.match(navigationSource, /RoomType\.SPORTS_STADIUM\]: \{ x: 0\.5, y: 0\.84 \}/);
  assert.match(navigationSource, /\{ x: 0\.08, y: 0\.31 \}, \{ x: 0\.92, y: 0\.31 \}/);
});

test('town route entry positions depend on the scene the cat came from', () => {
  assert.match(petRoomSource, /RoomType\.SHOPPING_STREET[\s\S]*?RoomType\.SPORTS_GROUND\]: \{ x: 0\.5, y: 0\.12 \}/);
  assert.match(petRoomSource, /RoomType\.SHOPPING_STREET[\s\S]*?RoomType\.TOWN_HOME\]: \{ x: 0\.14, y: 0\.30 \}/);
  assert.match(petRoomSource, /RoomType\.SPORTS_GROUND[\s\S]*?RoomType\.SHOPPING_STREET\]: \{ x: 0\.33, y: 0\.82 \}/);
  assert.match(petRoomSource, /RoomType\.SPORTS_GROUND[\s\S]*?RoomType\.SPORTS_STADIUM\]: \{ x: 0\.5, y: 0\.84 \}/);
  assert.match(petRoomSource, /RoomType\.SPORTS_STADIUM[\s\S]*?RoomType\.SPORTS_GROUND\]: \{ x: 0\.5, y: 0\.18 \}/);
  assert.match(petRoomSource, /RoomType\.TOWN_HOME[\s\S]*?RoomType\.SHOPPING_STREET\]: \{ x: 0\.84, y: 0\.53 \}/);
  assert.match(petRoomSource, /RoomType\.TOWN_HOME[\s\S]*?RoomType\.KART_TRACK\]: \{ x: 0\.414, y: 0\.14 \}/);
  assert.match(petRoomSource, /RoomType\.SPORTS_GROUND[\s\S]*?RoomType\.KART_TRACK\]: \{ x: 0\.13, y: 0\.49 \}/);
  assert.match(petRoomSource, /RoomType\.KART_TRACK[\s\S]*?RoomType\.TOWN_HOME\]: \{ x: 0\.83, y: 0\.84 \}/);
  assert.match(petRoomSource, /RoomType\.KART_TRACK[\s\S]*?RoomType\.SPORTS_GROUND\]: \{ x: 0\.88, y: 0\.23 \}/);
  assert.match(petRoomSource, /outdoorEntryPlacementRef\.current\?\.room === currentRoom/);
});

test('karting pedestrians cannot enter the removed lower-left spur', () => {
  for (const x of [0.22, 0.26, 0.29]) {
    for (const y of [0.52, 0.58, 0.67, 0.73]) {
      const point = { x: x * 1862, y: y * 845 };
      const constrained = navigation.constrainOutdoorPosition(RoomType.KART_TRACK, point, point, 1862, 845);
      assert.ok(Math.hypot(constrained.x - point.x, constrained.y - point.y) > 1, `${x}, ${y} must be blocked`);
    }
  }
});

test('the cleared karting plaza supports crossing where the tree planter used to stand', () => {
  for (const [width, height] of [[1862, 845], [1280, 720]]) {
    for (const y of [0.33, 0.38, 0.43]) {
      let current = { x: 0.18 * width, y: y * height };
      for (let x = 0.18; x <= 0.35; x += 0.005) {
        const target = { x: x * width, y: y * height };
        const next = navigation.constrainOutdoorPosition(RoomType.KART_TRACK, current, target, width, height);
        assert.ok(Math.hypot(next.x - target.x, next.y - target.y) < 0.01, 'the former planter must not block the plaza');
        current = next;
      }
    }
    const bench = { x: 0.255 * width, y: 0.235 * height };
    const next = navigation.constrainOutdoorPosition(RoomType.KART_TRACK, bench, bench, width, height);
    assert.ok(Math.hypot(next.x - bench.x, next.y - bench.y) > 1, 'the north-edge bench remains outside the walking area');
  }
});

test('clicked exits follow continuous walkable paths around road bends', () => {
  const routes = [
    [RoomType.TOWN_HOME, { x: 0.55, y: 0.48 }, { x: 0.83, y: 0.95 }],
    [RoomType.TOWN_HOME, { x: 0.83, y: 0.84 }, { x: 0.04, y: 0.30 }],
    [RoomType.SPORTS_GROUND, { x: 0.50, y: 0.18 }, { x: 0.96, y: 0.25 }],
    [RoomType.SPORTS_GROUND, { x: 0.88, y: 0.23 }, { x: 0.50, y: 0.06 }],
    [RoomType.KART_TRACK, { x: 0.414, y: 0.14 }, { x: 0.04, y: 0.49 }],
    [RoomType.KART_TRACK, { x: 0.13, y: 0.49 }, { x: 0.414, y: 0.06 }],
  ];
  for (const [width, height] of [[1862, 845], [1280, 720]]) {
    for (const [room, start, end] of routes) {
      let current = { x: start.x * width, y: start.y * height };
      const target = { x: end.x * width, y: end.y * height };
      const path = navigation.getOutdoorWalkPath(room, current, target, width, height);
      for (const next of path) {
        const segmentStart = current;
        for (let step = 1; step <= 100; step += 1) {
          const point = { x: segmentStart.x + (next.x - segmentStart.x) * step / 100, y: segmentStart.y + (next.y - segmentStart.y) * step / 100 };
          const constrained = navigation.constrainOutdoorPosition(room, current, point, width, height);
          assert.ok(Math.hypot(constrained.x - point.x, constrained.y - point.y) < 0.01, `${room} path crosses blocked scenery at ${point.x / width}, ${point.y / height}`);
          current = point;
        }
      }
      assert.ok(Math.hypot(current.x - target.x, current.y - target.y) < 0.01);
    }
  }
});
