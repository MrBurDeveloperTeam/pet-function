import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

test('fishing pause preserves timer budget and resumes without advancing during portrait', () => {
  const source = readFileSync(new URL('../src/pet/internal/components/FishingGame.tsx', import.meta.url), 'utf8');
  const hook = source.match(/function useFishingTimeout[\s\S]*?\n\}/)[0];
  let now = 0, index = 0, timerId = 0, elapsed = 0, cleanup, dependencies;
  const refs = [], timers = new Map();
  const context = {
    useRef: value => refs[index++] ??= { current: value },
    useEffect: (effect, next) => {
      if (dependencies && next.every((value, i) => value === dependencies[i])) return;
      cleanup?.(); dependencies = next; cleanup = effect();
    },
    performance: { now: () => now },
    window: {
      setTimeout: (callback, delay) => { timers.set(++timerId, { callback, end: now + delay }); return timerId; },
      clearTimeout: id => timers.delete(id),
    },
  };
  vm.createContext(context);
  vm.runInContext(transformSync(hook, { loader: 'ts' }).code + '\nglobalThis.timerHook=useFishingTimeout;', context);
  const render = (active, paused, cycle = 0) => { index = 0; context.timerHook(active, paused, cycle, () => 5000, () => elapsed++); };
  const advance = milliseconds => {
    now += milliseconds;
    for (const [id, timer] of timers) if (timer.end <= now) { timers.delete(id); timer.callback(); }
  };
  render(true, false);
  advance(2000);
  render(true, true);
  advance(10000);
  assert.equal(elapsed, 0);
  assert.equal(timers.size, 0);
  render(true, false);
  advance(2999);
  assert.equal(elapsed, 0);
  advance(1);
  assert.equal(elapsed, 1);
  render(true, false, 1);
  advance(1000);
  render(false, false, 1);
  advance(10000);
  assert.equal(elapsed, 1, 'Leaving the fishing phase cancels its timer');
});
