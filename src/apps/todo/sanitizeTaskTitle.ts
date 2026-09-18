// Conservative task-title sanitizer for the Personalized Insight banner.
// Mirrors the same safety rule the Gallery reference implementation uses
// for task titles shown in its own dialogue bubble
// (features/petDialogue/safeTaskTitle.ts in the Gallery repo) — reimplemented
// here rather than imported, since these are separate repositories with no
// shared package (see the Phase-2A design pass's Option C recommendation).
// A task title is user-authored free text shown here without prior
// moderation; this never rewrites or infers meaning from it, it only strips
// formatting hazards and refuses anything unusable, falling back to a
// generic message in that case.

const MAX_SAFE_TASK_TITLE_LENGTH = 80;

// C0/C1 control characters and zero-width formatting characters — none
// render as anything useful in a compact banner, and a zero-width character
// could otherwise be used to visually hide content inside an apparently
// short title.
const UNSAFE_CONTROL_AND_ZERO_WIDTH_PATTERN = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u200B-\\u200D\\uFEFF]',
  'g'
);

/**
 * Returns a trimmed, single-line, length-capped title safe for the compact
 * insight banner, or `null` if the input isn't usable (blank, non-string, or
 * left empty after sanitization) — callers must fall back to a generic
 * message rather than rendering an empty quote.
 */
export function sanitizeTaskTitle(rawTitle: unknown): string | null {
  if (typeof rawTitle !== 'string') return null;

  const withoutUnsafeChars = rawTitle.replace(UNSAFE_CONTROL_AND_ZERO_WIDTH_PATTERN, '');
  const singleLine = withoutUnsafeChars.replace(/[\r\n]+/g, ' ');
  const collapsedWhitespace = singleLine.replace(/\s+/g, ' ').trim();
  if (collapsedWhitespace.length === 0) return null;

  const codePoints = Array.from(collapsedWhitespace);
  if (codePoints.length <= MAX_SAFE_TASK_TITLE_LENGTH) return collapsedWhitespace;

  const truncated = codePoints.slice(0, MAX_SAFE_TASK_TITLE_LENGTH).join('').trimEnd();
  return `${truncated}...`;
}
