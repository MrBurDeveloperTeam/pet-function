// Deterministic default-deny mutation guard — defense-in-depth per the
// established pattern (Inventory/To-Do/Appointments), even though the
// readiness pass confirmed `window.__MOLAR_ACTIONS__` in this repo is
// genuinely dead code today (never assigned anywhere — see
// MolarAIFloat.jsx, which only reads it) AND its only defined actions
// are navigation (`OPEN_LESSON`/`OPEN_CATEGORY`/`OPEN_SEARCH`), not
// mutations. This guard exists so future wiring of follow/unfollow/
// like/publish/delete actions cannot silently turn Data Chat into a
// mutation channel without this file being revisited — the read-only
// guarantee must not depend on that mechanism remaining unwired forever.

const INFORMATIONAL_PATTERNS: RegExp[] = [
  /^how (do|does|can|would|could) i?\b/,
  /^what happens (if|when)\b/,
  /^what is the process (for|to)\b/,
  /^explain\b/,
  /^tell me (about|how)\b/,
];

/** Unambiguous enough to trigger alone — don't show up in ordinary
 *  read-request phrasing about this app's own data. */
const STRONG_MUTATION_VERBS = ['unfollow', 'publish', 'delete'];

/** `follow`/`like`/`edit`/`mark` are common conversational verbs too
 *  ("Did anyone I follow post...", "I like this video's topic") — only
 *  count as a mutation when directly acting on a video/creator/
 *  notification OBJECT, not merely co-occurring anywhere in the
 *  sentence. */
const AMBIGUOUS_VERB_OBJECT_PATTERN =
  /\b(follow|unfollow|like|edit|mark)\s+(this|that|my)?\s*(video|creator|notification|comment)\b/;

function isInformationalPhrasing(normalized: string): boolean {
  return INFORMATIONAL_PATTERNS.some((p) => p.test(normalized));
}

function containsMutationOperation(normalized: string): boolean {
  if (STRONG_MUTATION_VERBS.some((v) => new RegExp(`\\b${v}\\b`).test(normalized))) return true;
  return AMBIGUOUS_VERB_OBJECT_PATTERN.test(normalized);
}

export function isElearningMutationRequest(message: string): boolean {
  const normalized = message.trim().toLowerCase().replace(/[?.!]+$/, '');
  if (!normalized) return false;
  if (isInformationalPhrasing(normalized)) return false;
  return containsMutationOperation(normalized);
}


