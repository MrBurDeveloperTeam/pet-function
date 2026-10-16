export const MEOW_STATES = Object.freeze(['Normal', 'Hungry', 'Unhappy', 'Dirty', 'Low Energy']);

export const MAX_MEOW_TEXT_LENGTH = 500;

/** Keep the existing AIBoard defaults available even without saved presets. */
export const DEFAULT_MEOW_LINES = Object.freeze({
  Normal: Object.freeze(['Meow.', 'Purr...', '*stretches*']),
  Hungry: Object.freeze(["Meow! I'm hungry!", 'Feed me right meow!', 'Where is my tuna?']),
  Unhappy: Object.freeze(['Hmph.', "Don't touch me.", 'I am displeased.']),
  Dirty: Object.freeze(['I need a bath...', "Yuck, I'm all dusty.", 'Time to groom myself.']),
  'Low Energy': Object.freeze(['*yawns*', 'So sleepy...', 'Nap time...']),
});

export const DEFAULT_MEOW_TIMING = Object.freeze({
  Normal: Object.freeze({ durationMs: 6000, intervalMs: 15000, disabled: false }),
  Hungry: Object.freeze({ durationMs: 9000, intervalMs: 12000, disabled: false }),
  Unhappy: Object.freeze({ durationMs: 6000, intervalMs: 12000, disabled: false }),
  Dirty: Object.freeze({ durationMs: 6000, intervalMs: 12000, disabled: false }),
  'Low Energy': Object.freeze({ durationMs: 9000, intervalMs: 21000, disabled: false }),
});

const isMeowState = state => MEOW_STATES.includes(state);
const invalidControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const invisibleOnly = /^[\s\p{Cf}\p{M}]*$/u;
const MAX_TIMER_MS = 2147483647;

/** Returns plain text only; callers render the result as a text node. */
export function validateMeowText(text) {
  if (typeof text !== 'string') throw new Error('Enter a preset message.');
  const trimmed = text.trim();
  if (!trimmed || invisibleOnly.test(trimmed)) throw new Error('Enter a preset message.');
  if (invalidControls.test(trimmed)) throw new Error('Preset messages cannot contain control characters.');
  if (Array.from(trimmed).length > MAX_MEOW_TEXT_LENGTH) {
    throw new Error(`Preset messages must contain ${MAX_MEOW_TEXT_LENGTH} characters or fewer.`);
  }
  return trimmed;
}

function safeText(value) {
  try { return validateMeowText(value); } catch { return null; }
}

function safeMilliseconds(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_TIMER_MS ? parsed : fallback;
}

/** Map AIBoard rows without adding defaults, seeding data, or consuming audio. */
export function normalizeMeowConfiguration(messageRows = [], timingRows = []) {
  const presets = [];
  const seenIds = new Set();
  for (const row of Array.isArray(messageRows) ? messageRows : []) {
    if (!row || !isMeowState(row.state) || row.is_audio !== false || typeof row.id !== 'string' || !row.id || seenIds.has(row.id)) continue;
    const text = safeText(row.message);
    if (!text) continue;
    seenIds.add(row.id);
    presets.push({ id: row.id, state: row.state, text });
  }

  const timing = {};
  for (const row of Array.isArray(timingRows) ? timingRows : []) {
    if (!row || !isMeowState(row.state) || Object.hasOwn(timing, row.state)) continue;
    const defaults = DEFAULT_MEOW_TIMING[row.state];
    timing[row.state] = {
      durationMs: safeMilliseconds(Number(row.message_duration_minutes) * 60000, defaults.durationMs),
      intervalMs: safeMilliseconds(Number(row.message_interval_minutes) * 60000, defaults.intervalMs),
      disabled: row.disabled === true,
    };
  }
  return { presets, timing };
}

/** Saved lines supplement the built-in ambient sayings for the current states. */
export function resolveMeowCycle(config, states) {
  const active = [...new Set((Array.isArray(states) ? states : []).filter(isMeowState))];
  if (!active.length) active.push('Normal');
  const enabled = active.filter(state => config?.timing?.[state]?.disabled !== true);
  if (!enabled.length) return null;

  const lines = [];
  const seen = new Set();
  for (const state of enabled) {
    const saved = (Array.isArray(config?.presets) ? config.presets : [])
      .filter(preset => preset?.state === state)
      .map(preset => preset.text);
    for (const value of [...DEFAULT_MEOW_LINES[state], ...saved]) {
      const text = safeText(value);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      lines.push(text);
    }
  }

  const primary = enabled[0];
  const defaults = DEFAULT_MEOW_TIMING[primary];
  const timing = config?.timing?.[primary];
  return {
    lines,
    durationMs: safeMilliseconds(timing?.durationMs, defaults.durationMs),
    intervalMs: safeMilliseconds(timing?.intervalMs, defaults.intervalMs),
  };
}

/** Avoid repeating the same phrase, including when the active pool changes. */
export function createMeowLinePicker(random = Math.random) {
  let previous = null;
  return lines => {
    const pool = [...new Set((Array.isArray(lines) ? lines : []).map(safeText).filter(Boolean))];
    if (!pool.length) return null;
    const eligible = pool.length > 1 ? pool.filter(line => line !== previous) : pool;
    const value = Number(random());
    const position = Number.isFinite(value) ? Math.min(Math.max(value, 0), 1 - Number.EPSILON) : 0;
    const selected = eligible[Math.floor(position * eligible.length)];
    previous = selected;
    return selected;
  };
}
