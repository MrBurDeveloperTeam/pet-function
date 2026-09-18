// Deterministic default-deny mutation guard — defense-in-depth per the
// established pattern (Inventory/To-Do/Appointments/E-Learning), even
// though the readiness pass confirmed `window.__MOLAR_ACTIONS__` in this
// repo is genuinely dead code today (never assigned anywhere) AND its
// hardcoded action cases (copy-pasted from the Appointments repo —
// `ADD_APPOINTMENT`, `ADD_STAFF`, etc.) have ZERO calculator-relevant
// actions. This guard exists so a future `SET_INPUT`/`RESET_CALCULATOR`/
// `SAVE_PLAN` action being wired up cannot silently turn Data Chat into
// a mutation channel without this file being revisited.

const INFORMATIONAL_PATTERNS: RegExp[] = [
  /^how (do|does|can|would|could) i?\b/,
  /^what happens (if|when)\b/,
  /^what is the process (for|to)\b/,
  /^explain\b/,
  /^tell me (about|how)\b/,
];

/** Unambiguous enough to trigger alone. */
const STRONG_MUTATION_VERBS = ['reset', 'save'];

/** `set`/`change`/`update`/`increase`/`decrease` are common conversational
 *  verbs too — only count as a mutation when directly acting on a
 *  calculator-input OBJECT, not merely co-occurring anywhere in the
 *  sentence (e.g. "How does the calculator estimate monthly cost?" must
 *  not trigger merely because "does...estimate" is nearby "cost"). */
const AMBIGUOUS_VERB_OBJECT_PATTERN =
  /\b(set|change|update|increase|decrease)\s+(\w+\s+)?(rent|staff cost|salary|revenue|working days|patients|overhead|calculator|plan)\b/;

function isInformationalPhrasing(normalized: string): boolean {
  return INFORMATIONAL_PATTERNS.some((p) => p.test(normalized));
}

function containsMutationOperation(normalized: string): boolean {
  if (STRONG_MUTATION_VERBS.some((v) => new RegExp(`\\b${v}\\b`).test(normalized))) return true;
  return AMBIGUOUS_VERB_OBJECT_PATTERN.test(normalized);
}

export function isProfitMutationRequest(message: string): boolean {
  const normalized = message.trim().toLowerCase().replace(/[?.!]+$/, '');
  if (!normalized) return false;
  if (isInformationalPhrasing(normalized)) return false;
  return containsMutationOperation(normalized);
}
