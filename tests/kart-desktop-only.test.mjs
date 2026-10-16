import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = readFileSync(new URL('../public/games/cat-kart/entry.js', import.meta.url), 'utf8');
function launch({ userAgent = 'Mozilla Windows', platform = 'Win32', maxTouchPoints = 0,
  coarse = false, embedded = false, failedScript = false, failedEngine = false } = {}) {
  const elements = new Map(), requests = [], messages = [], navigations = [], engines = [], events = new Map();
  for (const id of ['canvas', 'loading', 'status', 'retry', 'desktop-only', 'desktop-back']) {
    elements.set(id, { removed: false, hidden: id === 'retry', textContent: '', events: new Map(),
      remove() { this.removed = true; }, addEventListener(name, fn) { this.events.set(name, fn); },
      showModal() { this.open = true; } });
  }
  const window = { matchMedia: () => ({ matches: coarse }),
    PetGamePerformance: { canvasPolicy: value => value },
    addEventListener: (name, fn) => events.set(name, fn) };
  const parent = embedded ? { postMessage: (data, origin) => messages.push({ data, origin }) } : window;
  const location = { origin: 'https://local.test', assign: value => navigations.push(value), reload() {} };
  vm.runInNewContext(source, { navigator: { userAgent, platform, maxTouchPoints }, window, parent, location,
    document: { getElementById: id => elements.get(id), createElement: () => ({}),
      head: { appendChild(script) { requests.push(script.src); queueMicrotask(() => failedScript ? script.onerror() : script.onload()); } } },
    Engine: class {
      constructor(options) { engines.push(options); }
      startGame({ onProgress }) { onProgress(1, 2); return failedEngine ? Promise.reject(new Error('WebGL failed')) : Promise.resolve(); }
    },
  });
  return { elements, requests, messages, navigations, engines, events, window, location };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('phones and tablets block both orientations before requesting any engine resource', async () => {
  for (const device of [
    { userAgent: 'Android' }, { userAgent: 'iPhone' }, { userAgent: 'iPad' }, { userAgent: 'iPod' },
    { userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 }, { coarse: true },
  ]) {
    const game = launch(device); await settle();
    assert.equal(game.elements.get('desktop-only').open, true);
    assert.equal(game.elements.get('canvas').removed, true);
    assert.equal(game.elements.get('loading').removed, true);
    assert.equal(game.requests.length, 0); assert.equal(game.engines.length, 0);
  }
});
test('mobile Back and Escape close embedded kart through the existing parent protocol', () => {
  for (const method of ['click', 'cancel']) {
    const game = launch({ userAgent: 'iPhone', embedded: true });
    let prevented = false;
    const target = game.elements.get(method === 'click' ? 'desktop-back' : 'desktop-only');
    target.events.get(method)({ preventDefault() { prevented = true; } });
    assert.equal(JSON.stringify(game.messages), JSON.stringify([{ data: { source: 'cat-kart', type: 'KART_CLOSE' }, origin: 'https://local.test' }]));
    if (method === 'cancel') assert.equal(prevented, true);
    assert.equal(game.navigations.length, 0);
  }
});
test('standalone mobile Back returns to the pet page without starting a game', () => {
  const game = launch({ userAgent: 'Android' });
  game.elements.get('desktop-back').events.get('click')();
  assert.deepEqual(game.navigations, ['/?pet=1']); assert.equal(game.requests.length, 0);
});
test('desktop and non-touch Mac keep engine settings, progress and loading cleanup', async () => {
  for (const device of [{}, { userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 0 }]) {
    const game = launch(device); await settle();
    assert.deepEqual(game.requests, ['/games/mobile-performance.js?v=2', '/games/mole-game/index.js']);
    assert.equal(game.engines.length, 1);
    assert.equal(game.engines[0].mainPack, '/games/cat-kart/index.pck?v=landscape-1-compact-1');
    assert.equal(game.elements.get('desktop-only').removed, true);
    assert.equal(game.elements.get('status').textContent, 'Preparing the track · 50%');
    assert.equal(game.elements.get('loading').removed, true);
  }
});
test('desktop script and engine failures retain an actionable retry', async () => {
  for (const options of [{ failedScript: true }, { failedEngine: true }]) {
    const game = launch(options); await settle();
    assert.equal(game.elements.get('retry').hidden, false);
    assert.equal(game.elements.get('loading').removed, false);
    assert.match(game.elements.get('status').textContent, /Unable to start/);
  }
});
test('standalone desktop only accepts its own same-origin close event', async () => {
  const game = launch(); await settle();
  const handler = game.events.get('message');
  const data = { source: 'cat-kart', type: 'KART_CLOSE' };
  handler({ data, source: game.window, origin: 'https://other.test' });
  handler({ data, source: {}, origin: game.location.origin });
  assert.equal(game.navigations.length, 0);
  handler({ data, source: game.window, origin: game.location.origin });
  assert.deepEqual(game.navigations, ['/?pet=1']);
});
