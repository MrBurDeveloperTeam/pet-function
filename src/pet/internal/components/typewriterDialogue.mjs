/** Segment before animating so a frame never exposes half an emoji or combining mark. */
export function segmentDialogueText(text) {
  if (typeof Intl.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), part => part.segment);
  }
  // Older embedded browsers: retain combining marks, flags and joined emoji.
  const parts = [];
  let regionalCount = 0;
  for (const point of Array.from(text)) {
    const previous = parts.at(-1);
    const regional = /[\u{1f1e6}-\u{1f1ff}]/u.test(point);
    const attached = /[\p{Mark}\u{fe0f}\u{1f3fb}-\u{1f3ff}\u{e0020}-\u{e007f}]/u.test(point)
      || point === '\u200d' || previous?.endsWith('\u200d')
      || (regional && regionalCount % 2 === 1);
    if (previous !== undefined && attached) parts[parts.length - 1] += point;
    else parts.push(point);
    regionalCount = regional ? regionalCount + 1 : 0;
  }
  return parts;
}

/** A single line owns both the typing timer and its three-second dismissal timer. */
export function createTypewriterDialogue({
  text, onChange, onClose,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = timer => clearTimeout(timer),
  intervalMs = 28, lingerMs = 3000,
}) {
  const characters = segmentDialogueText(text);
  let cursor = 0;
  let timer;
  let disposed = false;
  let closed = false;
  const clearTimer = () => {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  };
  const close = () => {
    if (disposed || closed) return;
    closed = true;
    clearTimer();
    onClose();
  };
  const publish = () => onChange({ visibleText: characters.slice(0, cursor).join(''), complete: cursor === characters.length });
  const waitToClose = () => { timer = schedule(close, lingerMs); };
  const tick = () => {
    timer = undefined;
    if (disposed || closed) return;
    cursor++;
    publish();
    if (cursor === characters.length) waitToClose();
    else timer = schedule(tick, intervalMs);
  };
  publish();
  if (characters.length) timer = schedule(tick, intervalMs);
  else waitToClose();
  return {
    advance() {
      if (disposed || closed) return;
      if (cursor === characters.length) { close(); return; }
      clearTimer();
      cursor = characters.length;
      publish();
      waitToClose();
    },
    dispose() {
      disposed = true;
      clearTimer();
    },
  };
}

/** Capture Space before native button activation and gameplay shortcuts. */
export function handleTypewriterSpace(event, advance) {
  if (event.code !== 'Space' && event.key !== ' ' && event.key !== 'Spacebar') return false;
  if (event.isComposing) return false;
  const target = event.target;
  if (target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!event.repeat) advance();
  return true;
}
