// Deterministic guard against obvious task MUTATION requests reaching the
// existing General Chat pipeline during this read-only Phase-3 pilot.
//
// CONTEXT: the Phase-3 readiness pass found `MolarAIFloat.jsx`'s existing
// chat handler parses a fenced ` ```json ` block from the model's
// response and, if `window.__MOLAR_ACTIONS__` is set, dispatches
// `ADD_TASK`/`UPDATE_TASK`/`COMPLETE_TASK`/`DELETE_TASK` to it. That
// global is currently assigned NOWHERE in this repo — the mechanism is
// inert today — but it is still a live-looking, unused hook that could
// be wired later without anyone revisiting this exact file. This guard
// is implemented as defense-in-depth so Data-Driven Chat's read-only
// guarantee never depends on that dead code remaining dead forever; it
// does not modify or remove `window.__MOLAR_ACTIONS__` itself (a separate
// hygiene/security task).
//
// SAFETY DEFAULT: mirrors the final, browser-validated design from the
// sibling Inventory repo's Phase-3 pilot — a small, anchored
// INFORMATIONAL allowlist is checked first; otherwise, the presence of a
// recognized task-mutation operation verb/phrase ANYWHERE in the message
// intercepts it (default-deny), no imperative sentence structure or
// digit required.

/** Explanatory/mechanics questions — checked FIRST and exempted even if a
 *  mutation verb appears later in the same sentence. Deliberately narrow
 *  and anchored to the start of the message — never a bare question-word
 *  exemption. */
const INFORMATIONAL_PATTERNS: RegExp[] = [
  /^how (do|does|can|would|could) i?\b/, // "How do I complete a task?", "How does task priority work?"
  /^what happens (if|when)\b/, // "What happens when I mark a task done?"
  /^what is the process (for|to)\b/,
  /^explain\b/, // "Explain how to delete a task."
  /^tell me (about|how)\b/,
];

/** STRONG operation words: specific enough to this app's task-management
 *  domain that they trigger the guard on their own, anywhere in the
 *  message. */
const STRONG_MUTATION_VERBS = ['delete', 'complete'];

/** "Mark ... done/completed" is a common phrasing that doesn't contain
 *  the word "complete" — matched as its own pattern (verb and object not
 *  necessarily adjacent: "Mark task X done."). */
const MARK_DONE_PATTERN = /\bmark(ed)?\b[\s\S]*\b(done|completed)\b/;

/** WEAK/generic operation words: common enough in ordinary English
 *  ("add", "create", "change", "move", "update") that they only count as
 *  a mutation signal when paired with explicit task context — otherwise
 *  they would over-intercept unrelated conversation. */
const CONTEXTUAL_MUTATION_VERBS = ['add', 'create', 'change', 'move', 'update'];
const TASK_CONTEXT_WORDS = ['task', 'tasks', 'todo', 'to-do', 'due date', 'priority', 'reminder', 'list'];

function isInformationalPhrasing(normalized: string): boolean {
  return INFORMATIONAL_PATTERNS.some((pattern) => pattern.test(normalized));
}

function containsMutationOperation(normalized: string): boolean {
  if (STRONG_MUTATION_VERBS.some((verb) => normalized.includes(verb))) return true;
  if (MARK_DONE_PATTERN.test(normalized)) return true;

  for (const verb of CONTEXTUAL_MUTATION_VERBS) {
    if (!normalized.includes(verb)) continue;
    if (TASK_CONTEXT_WORDS.some((word) => normalized.includes(word))) return true;
  }

  return false;
}

export function isTaskMutationRequest(message: string): boolean {
  // Strip trailing punctuation only — "Can you complete task X?" and
  // "Can you complete task X" must classify identically.
  const normalized = message.trim().toLowerCase().replace(/[?.!]+$/, '');
  if (!normalized) return false;

  if (isInformationalPhrasing(normalized)) return false;

  return containsMutationOperation(normalized);
}

