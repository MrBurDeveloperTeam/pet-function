// Conservative task-title sanitizer for the Todo P0/P2 dialogue bubbles.
// A task title is user-authored free text, not a curated display string —
// unlike an inventory item name, it's shown here for the first time without
// any prior moderation. This never rewrites or infers meaning from the
// title, it only strips formatting hazards and refuses anything too long or
// empty, falling back to a generic message in that case.

const MAX_SAFE_TASK_TITLE_LENGTH = 80;

// C0/C1 control characters (excluding the whitespace ones already handled
// by the \s+ collapse below) and zero-width formatting characters — none of
// these render as anything useful in a compact bubble, and a zero-width
// character in particular could otherwise be used to visually hide content
// inside an apparently-short title. Built from a plain-ASCII \u-escape
// string via the RegExp constructor (rather than a literal regex character
// class) so no actual control/zero-width byte is ever present in this
// source file.
const UNSAFE_CONTROL_AND_ZERO_WIDTH_PATTERN = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u200B-\\u200D\\uFEFF]',
  'g'
);

/**
 * Returns a trimmed, single-line, length-capped title safe for the compact
 * mascot bubble, or `null` if the input isn't usable (blank, non-string, or
 * left empty after sanitization) - callers must fall back to a generic
 * message rather than rendering an empty quote.
 */
export function sanitizeTaskTitleForDialogue(rawTitle: unknown): string | null {
  if (typeof rawTitle !== 'string') return null;

  const withoutUnsafeChars = rawTitle.replace(UNSAFE_CONTROL_AND_ZERO_WIDTH_PATTERN, '');
  const singleLine = withoutUnsafeChars.replace(/[\r\n]+/g, ' ');
  const collapsedWhitespace = singleLine.replace(/\s+/g, ' ').trim();
  if (collapsedWhitespace.length === 0) return null;

  // Truncate by Unicode code point, never by raw UTF-16 code unit -
  // String.prototype.slice operates on code units and can split a
  // surrogate pair (e.g. an emoji) in half, producing a broken/lone
  // surrogate in the rendered bubble. Array.from iterates by code point.
  const codePoints = Array.from(collapsedWhitespace);
  if (codePoints.length <= MAX_SAFE_TASK_TITLE_LENGTH) return collapsedWhitespace;

  const truncated = codePoints.slice(0, MAX_SAFE_TASK_TITLE_LENGTH).join('').trimEnd();
  return `${truncated}...`;
}
