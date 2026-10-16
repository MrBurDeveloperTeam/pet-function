import test from 'node:test';
import assert from 'node:assert/strict';
import { createTypewriterDialogue, handleTypewriterSpace, segmentDialogueText } from '../src/pet/internal/components/typewriterDialogue.mjs';

function fakeClock() {
  let now = 0, nextId = 0;
  const jobs = new Map();
  return {
    schedule(callback, delay) { const id = ++nextId; jobs.set(id, { at: now + delay, callback }); return id; },
    cancel(id) { jobs.delete(id); },
    get pending() { return jobs.size; },
    advance(duration) {
      const end = now + duration;
      while (true) {
        const job = [...jobs.entries()].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!job) break;
        jobs.delete(job[0]);
        now = job[1].at;
        job[1].callback();
      }
      now = end;
    },
  };
}

function line(clock, text) {
  const frames = [];
  let closes = 0;
  const controller = createTypewriterDialogue({ text, schedule: clock.schedule, cancel: clock.cancel,
    onChange: frame => frames.push(frame), onClose: () => closes++ });
  return { ...controller, frames, get closes() { return closes; } };
}

test('types a complete grapheme every 28ms and closes exactly three seconds after the final frame', () => {
  const clock = fakeClock();
  const dialogue = line(clock, 'Hi🐈‍⬛!');
  assert.deepEqual(dialogue.frames, [{ visibleText: '', complete: false }]);
  clock.advance(27);
  assert.equal(dialogue.frames.length, 1);
  clock.advance(1);
  assert.equal(dialogue.frames.at(-1).visibleText, 'H');
  clock.advance(56);
  assert.deepEqual(dialogue.frames.at(-1), { visibleText: 'Hi🐈‍⬛', complete: false });
  clock.advance(28);
  assert.deepEqual(dialogue.frames.at(-1), { visibleText: 'Hi🐈‍⬛!', complete: true });
  clock.advance(2999);
  assert.equal(dialogue.closes, 0);
  clock.advance(1);
  assert.equal(dialogue.closes, 1);
  dialogue.advance();
  clock.advance(10000);
  assert.equal(dialogue.closes, 1);
});

test('skipping cancels typing and starts a fresh three-second reading window', () => {
  const clock = fakeClock();
  const dialogue = line(clock, 'Meow~ Welcome! 🐾');
  clock.advance(84);
  dialogue.advance();
  assert.deepEqual(dialogue.frames.at(-1), { visibleText: 'Meow~ Welcome! 🐾', complete: true });
  assert.equal(clock.pending, 1);
  const frameCount = dialogue.frames.length;
  clock.advance(2999);
  assert.equal(dialogue.closes, 0);
  assert.equal(dialogue.frames.length, frameCount);
  clock.advance(1);
  assert.equal(dialogue.closes, 1);
});

test('a second interaction closes a completed line immediately and cancels auto-dismiss', () => {
  const clock = fakeClock();
  const dialogue = line(clock, 'Nice pick!');
  dialogue.advance();
  dialogue.advance();
  assert.equal(dialogue.closes, 1);
  assert.equal(clock.pending, 0);
  clock.advance(10000);
  dialogue.advance();
  assert.equal(dialogue.closes, 1);
});

test('replacement and unmount dispose both typing and reading timers without closing another line', () => {
  const clock = fakeClock();
  const old = line(clock, 'First message');
  clock.advance(28);
  old.dispose();
  const replacement = line(clock, 'New');
  const oldFrames = old.frames.length;
  clock.advance(84);
  assert.equal(old.frames.length, oldFrames);
  assert.equal(old.closes, 0);
  assert.equal(replacement.frames.at(-1).complete, true);
  replacement.dispose();
  clock.advance(10000);
  assert.equal(replacement.closes, 0);
  assert.equal(clock.pending, 0);
});

test('empty lines receive a reading window and graphemes retain flags, modifiers and combining text', () => {
  assert.deepEqual(segmentDialogueText('A☁️🐈‍⬛👍🏽🇲🇾e\u0301'), ['A', '☁️', '🐈‍⬛', '👍🏽', '🇲🇾', 'e\u0301']);
  const clock = fakeClock();
  const dialogue = line(clock, '');
  assert.deepEqual(dialogue.frames, [{ visibleText: '', complete: true }]);
  clock.advance(3000);
  assert.equal(dialogue.closes, 1);
});

function spaceEvent(overrides = {}) {
  return { code: 'Space', key: ' ', repeat: false, target: null, prevented: 0, stopped: 0,
    preventDefault() { this.prevented++; }, stopImmediatePropagation() { this.stopped++; }, ...overrides };
}

test('holding Space cannot finish and immediately close a line or activate the focused button', () => {
  const clock = fakeClock();
  const dialogue = line(clock, 'A long welcome 🐾');
  const first = spaceEvent({ target: { closest: () => null } });
  assert.equal(handleTypewriterSpace(first, dialogue.advance), true);
  assert.equal(dialogue.frames.at(-1).complete, true);
  assert.equal(first.prevented, 1);
  assert.equal(first.stopped, 1);
  for (let i = 0; i < 20; i++) {
    const repeat = spaceEvent({ repeat: true });
    handleTypewriterSpace(repeat, dialogue.advance);
    assert.equal(repeat.prevented, 1);
    assert.equal(repeat.stopped, 1);
  }
  assert.equal(dialogue.closes, 0);
  handleTypewriterSpace(spaceEvent(), dialogue.advance);
  assert.equal(dialogue.closes, 1);
});

test('typing into controls and composing text remain available while dialogue is present', () => {
  let advances = 0;
  const editable = spaceEvent({ target: { closest: () => ({ tagName: 'INPUT' }) } });
  const composition = spaceEvent({ isComposing: true });
  const otherKey = spaceEvent({ code: 'KeyW', key: 'w' });
  for (const event of [editable, composition, otherKey]) {
    assert.equal(handleTypewriterSpace(event, () => advances++), false);
    assert.equal(event.prevented, 0);
    assert.equal(event.stopped, 0);
  }
  assert.equal(advances, 0);
});
