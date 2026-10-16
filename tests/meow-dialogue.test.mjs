import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEOW_STATES, DEFAULT_MEOW_LINES, DEFAULT_MEOW_TIMING, MAX_MEOW_TEXT_LENGTH,
  validateMeowText, normalizeMeowConfiguration, resolveMeowCycle, createMeowLinePicker,
} from '../src/cat/meowDialogue.mjs';

test('default ambient sayings retain AIBoard wording and state timing', () => {
  assert.deepEqual(MEOW_STATES, ['Normal', 'Hungry', 'Unhappy', 'Dirty', 'Low Energy']);
  assert.deepEqual(DEFAULT_MEOW_LINES.Normal, ['Meow.', 'Purr...', '*stretches*']);
  assert.deepEqual(DEFAULT_MEOW_LINES.Hungry, ["Meow! I'm hungry!", 'Feed me right meow!', 'Where is my tuna?']);
  assert.deepEqual(DEFAULT_MEOW_TIMING['Low Energy'], { durationMs: 9000, intervalMs: 21000, disabled: false });
  assert.deepEqual(resolveMeowCycle(null, ['Normal']), {
    lines: [...DEFAULT_MEOW_LINES.Normal], durationMs: 6000, intervalMs: 15000,
  });
});

test('preset validation trims text, counts Unicode characters and rejects invisible/control content', () => {
  assert.equal(MAX_MEOW_TEXT_LENGTH, 500);
  assert.equal(validateMeowText('  A snack? 🐟  '), 'A snack? 🐟');
  assert.equal(validateMeowText('🐈'.repeat(500)), '🐈'.repeat(500));
  assert.equal(validateMeowText('<hello> & goodbye'), '<hello> & goodbye');
  for (const value of ['', ' \n\t', '\u200b\u200d', '\u0301', '\u0001', 'hello\u0000', 'x'.repeat(501), null, 17]) {
    assert.throws(() => validateMeowText(value));
  }
});

test('configuration mapping keeps valid text rows and ignores audio, malformed rows and duplicate ids', () => {
  const messages = [
    { id: 'a', state: 'Hungry', message: '  Tuna please!  ', is_audio: false },
    { id: 'audio', state: 'Audio', message: 'data:audio/wav;base64,...', is_audio: true },
    { id: 'wrong-kind', state: 'Normal', message: 'audio name', is_audio: true },
    { id: 'a', state: 'Hungry', message: 'duplicate', is_audio: false },
    { id: 'invalid', state: '__proto__', message: 'bad state', is_audio: false },
    { id: 'empty', state: 'Normal', message: '  ', is_audio: false },
    { state: 'Normal', message: 'no id', is_audio: false },
  ];
  const config = normalizeMeowConfiguration(messages, [
    { state: 'Hungry', message_duration_minutes: '0.2', message_interval_minutes: '0.3', disabled: true },
    { state: 'Hungry', message_duration_minutes: 5, message_interval_minutes: 5, disabled: false },
    { state: 'Normal', message_duration_minutes: -1, message_interval_minutes: 'bad', disabled: false },
    { state: 'Audio', message_duration_minutes: 1, message_interval_minutes: 1, disabled: false },
  ]);
  assert.deepEqual(config.presets, [{ id: 'a', state: 'Hungry', text: 'Tuna please!' }]);
  assert.deepEqual(config.timing.Hungry, { durationMs: 12000, intervalMs: 18000, disabled: true });
  assert.deepEqual(config.timing.Normal, DEFAULT_MEOW_TIMING.Normal);
  assert.equal(config.timing.Audio, undefined);
  assert.deepEqual(messages[0], { id: 'a', state: 'Hungry', message: '  Tuna please!  ', is_audio: false });
});

test('cycles add personal text to active state defaults, deduplicate and exclude unrelated states', () => {
  const config = {
    presets: [
      { id: '1', state: 'Hungry', text: 'Fish delivery?' },
      { id: '2', state: 'Hungry', text: ' Fish delivery? ' },
      { id: '3', state: 'Hungry', text: 'Where is my tuna?' },
      { id: '4', state: 'Normal', text: 'A lovely day.' },
      { id: '5', state: 'Dirty', text: 'Bubble bath?' },
      { id: '6', state: 'Dirty', text: '\u0000' },
    ],
    timing: { Hungry: { durationMs: 8000, intervalMs: 17000, disabled: false } },
  };
  const cycle = resolveMeowCycle(config, ['Hungry', 'Dirty', 'Hungry']);
  assert.deepEqual(cycle.lines, [...DEFAULT_MEOW_LINES.Hungry, 'Fish delivery?', ...DEFAULT_MEOW_LINES.Dirty, 'Bubble bath?']);
  assert.equal(cycle.durationMs, 8000);
  assert.equal(cycle.intervalMs, 17000);
  assert.ok(!cycle.lines.includes('A lovely day.'));
});

test('disabled state contributes neither defaults nor personal lines, and all disabled returns no cycle', () => {
  const config = {
    presets: [{ id: '1', state: 'Hungry', text: 'Fish?' }],
    timing: { Hungry: { disabled: true }, Normal: { disabled: true } },
  };
  assert.equal(resolveMeowCycle(config, ['Hungry']), null);
  assert.equal(resolveMeowCycle(config, []), null);
  assert.deepEqual(resolveMeowCycle(config, ['Hungry', 'Dirty']).lines, [...DEFAULT_MEOW_LINES.Dirty]);
  assert.deepEqual(resolveMeowCycle(undefined, ['not-a-state']), resolveMeowCycle(undefined, ['Normal']));
});

test('invalid or overflowing timers fall back to state defaults', () => {
  const config = { presets: [], timing: { Normal: { durationMs: Infinity, intervalMs: 3e12 } } };
  assert.deepEqual(resolveMeowCycle(config, ['Normal']), {
    lines: [...DEFAULT_MEOW_LINES.Normal], durationMs: 6000, intervalMs: 15000,
  });
});

test('random picker avoids consecutive duplicates, including on pool changes', () => {
  const pick = createMeowLinePicker(() => 0);
  assert.equal(pick(['hello', 'hello', 'goodbye']), 'hello');
  assert.equal(pick(['hello', 'goodbye']), 'goodbye');
  assert.equal(pick(['goodbye', 'a new day']), 'a new day');
  assert.equal(pick(['only one']), 'only one');
  assert.equal(pick(['only one']), 'only one');
  assert.equal(pick([' ', '\u200b']), null);
});

test('random boundaries never produce undefined or a phrase outside the active pool', () => {
  for (const randomValue of [0, 1, -1, NaN, Infinity]) {
    const pick = createMeowLinePicker(() => randomValue);
    for (let index = 0; index < 4; index++) assert.ok(['one', 'two', 'three'].includes(pick(['one', 'two', 'three'])));
  }
});
