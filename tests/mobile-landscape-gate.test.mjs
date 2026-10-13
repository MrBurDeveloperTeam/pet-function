import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../src/pet/internal/components/MobileLandscapeGate.tsx', import.meta.url), 'utf8');
const detection = source.match(/function needsRotation\([^\n]*\): boolean \{([\s\S]*?)\n\}/)[1];
function blocked(userAgent, width, height, platform = '', maxTouchPoints = 1, coarse = true, orientation = 'landscape') {
  return vm.runInNewContext(`(function(){${detection}})()`, {
    navigator: { userAgent, platform, maxTouchPoints },
    orientation,
    window: { innerWidth: width, innerHeight: height, matchMedia: () => ({ matches: coarse }) },
  });
}
test('Android and iOS wait in portrait and admit landscape', () => {
  for (const ua of ['Mozilla Android', 'Mozilla iPhone', 'Mozilla iPad']) {
    assert.equal(blocked(ua, 390, 844), true);
    assert.equal(blocked(ua, 844, 390), false);
  }
  assert.equal(blocked('Mozilla Macintosh', 768, 1024, 'MacIntel', 5), true);
  assert.equal(blocked('Mozilla Macintosh', 1024, 768, 'MacIntel', 5), false);
  assert.equal(blocked('Mozilla Windows', 600, 900, 'Win32', 0, false), false);
});
test('mole, kart and football require landscape; fishing, aircraft and hurdles require portrait', () => {
  for (const name of ['MoleGame', 'KartGame', 'FootballGame', 'FishingGame', 'AirStrikeGame']) {
    const game = readFileSync(new URL(`../src/pet/internal/components/${name}.tsx`, import.meta.url), 'utf8');
    assert.match(game, /<MobileLandscapeGate/);
    const gate=game.match(/<MobileLandscapeGate\b[^>]*>/)[0];
    if(['FishingGame','AirStrikeGame'].includes(name))assert.match(gate,/orientation="portrait"/);
    else assert.doesNotMatch(gate,/orientation="portrait"/);
    if (name !== 'FishingGame') assert.match(game, /data-landscape-game=/);
  }
  const runner = readFileSync(new URL('../src/pet/internal/components/GamePage.tsx', import.meta.url), 'utf8');
  assert.match(runner, /props.gameId === 'stadium-hurdles'/);
  assert.match(runner, /orientation="portrait"/);
  assert.equal(blocked('Android', 390, 844, '', 1, true, 'portrait'), false);
  assert.equal(blocked('iPhone', 844, 390, '', 1, true, 'portrait'), true);
  assert.equal(blocked('Mozilla Windows',844,390,'Win32',0,false,'portrait'),false);
  assert.match(source, /\{admitted && <LandscapePauseContext.Provider/);
});

test('portrait interruptions stay paused after landscape until explicit resume', () => {
  const reducerSource = source.match(/export function landscapeGateReducer[\s\S]*?\n\}/)[0].replace('export ', '');
  const context = vm.createContext({});
  vm.runInContext(transformSync(reducerSource, { loader: 'ts' }).code + '\nglobalThis.reduce=landscapeGateReducer;', context);
  const reduce = context.reduce;
  let state = { blocked: true, admitted: false, resumeRequired: false };
  state = reduce(state, { type: 'rotate', blocked: true });
  assert.equal(state.admitted, false, 'Portrait entry cannot mount the game');
  state = reduce(state, { type: 'rotate', blocked: false });
  assert.equal(state.admitted, true);
  assert.equal(state.resumeRequired, false, 'First landscape entry starts loading automatically');
  for (let interruption = 0; interruption < 3; interruption++) {
    state = reduce(state, { type: 'rotate', blocked: true });
    state = reduce(state, { type: 'resume' });
    assert.equal(state.resumeRequired, true, 'Cannot resume while portrait');
    state = reduce(state, { type: 'rotate', blocked: false });
    state = reduce(state, { type: 'rotate', blocked: false });
    assert.equal(state.resumeRequired, true, 'Orientation and resize events cannot auto-resume');
    assert.equal(state.admitted, true, 'The existing game stays mounted');
    state = reduce(state, { type: 'resume' });
    assert.equal(state.resumeRequired, false, 'Explicit resume restores play');
  }
});
