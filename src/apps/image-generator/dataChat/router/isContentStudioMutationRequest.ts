// Deterministic default-deny mutation guard — defense-in-depth per the
// established pattern (Inventory/To-Do/Appointments/E-Learning/Profit
// Calculator), even though the readiness pass confirmed this repo's
// General Chat has NO action-dispatch mechanism at all (not merely
// unwired — genuinely absent: no `window.__X_ACTIONS__` global, no
// fenced-JSON parsing anywhere in MolarAIFloat.jsx). This guard exists
// so a future action-execution feature (image/video generation routes
// already exist server-side — see src/app/api/generate/{image,video}/
// route.ts) cannot silently turn Data Chat into a mutation channel
// without this file being revisited.

const INFORMATIONAL_PATTERNS: RegExp[] = [
  /^how (do|does|can|would|could) i?\b/,
  /^what happens (if|when)\b/,
  /^what is the process (for|to)\b/,
  /^explain\b/,
  /^tell me (about|how)\b/,
];

/** Unambiguous enough to trigger alone — don't show up in ordinary
 *  read-request phrasing about this app's own data. */
const STRONG_MUTATION_VERBS = ['generate', 'regenerate', 'delete', 'publish'];

/** `save`/`post`/`create` are common conversational verbs too — only
 *  count as a mutation when directly acting on a generation/content
 *  OBJECT (with an optional one-word gap for "a"/"an"/"this"/"my"). */
const AMBIGUOUS_VERB_OBJECT_PATTERN = /\b(save|post|create)\s+(\w+\s+)?(generation|content|image|video)\b/;

function isInformationalPhrasing(normalized: string): boolean {
  return INFORMATIONAL_PATTERNS.some((p) => p.test(normalized));
}

function containsMutationOperation(normalized: string): boolean {
  if (STRONG_MUTATION_VERBS.some((v) => new RegExp(`\\b${v}\\b`).test(normalized))) return true;
  return AMBIGUOUS_VERB_OBJECT_PATTERN.test(normalized);
}

export function isContentStudioMutationRequest(message: string): boolean {
  const normalized = message.trim().toLowerCase().replace(/[?.!]+$/, '');
  if (!normalized) return false;
  if (isInformationalPhrasing(normalized)) return false;
  return containsMutationOperation(normalized);
}
