const MAX_CREATOR_DISPLAY_NAME_LENGTH = 80;
const UNSAFE_CONTROL_AND_ZERO_WIDTH_PATTERN = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u200B-\\u200D\\uFEFF]',
  'g'
);

/** Compact, single-line creator name for a pet dialogue, or undefined
 *  when the persisted profile value is not safely usable. */
export function sanitizeCreatorDisplayName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value
    .replace(UNSAFE_CONTROL_AND_ZERO_WIDTH_PATTERN, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return undefined;

  const codePoints = Array.from(cleaned);
  if (codePoints.length <= MAX_CREATOR_DISPLAY_NAME_LENGTH) return cleaned;
  return `${codePoints.slice(0, MAX_CREATOR_DISPLAY_NAME_LENGTH).join('').trimEnd()}...`;
}
