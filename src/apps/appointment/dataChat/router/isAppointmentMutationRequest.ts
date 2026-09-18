// Deterministic default-deny mutation guard — the conservative pattern
// already browser-validated in the Inventory and To-Do repos, ported
// here with appointment-specific vocabulary.
//
// Phase APPOINTMENT-MOLAR-AI-P0-SECURITY-HARDENING: the fenced ```json
// action-block parser/dispatcher in appointmentsMolarAdapter.ts that used
// to read `window.__MOLAR_ACTIONS__` has been removed entirely — Molar AI
// in this app has no path to any mutation now, regardless of what any
// response (Gemini or an admin-configured keyword response) contains.
// This guard remains as defense-in-depth for the Data Chat path
// specifically: it runs BEFORE any Gemini call, so a recognized mutation
// request never reaches Gemini at all and gets a clear, immediate refusal
// rather than a generic answer.

const INFORMATIONAL_PATTERNS: RegExp[] = [
  /^how (do|does|can|would|could) i?\b/,
  /^what happens (if|when)\b/,
  /^what is the process (for|to)\b/,
  /^explain\b/,
  /^tell me (about|how)\b/,
];

/** Unambiguous enough to trigger alone, no context word required — these
 *  don't show up in ordinary read-request phrasing. */
const STRONG_MUTATION_VERBS = ['cancel', 'reschedule'];

/** `confirm`/`approve`/`reject`/`decline` are common CONVERSATIONAL verbs
 *  too ("can you confirm how many appointments I have today?" is a read
 *  request, not a status-change request) — unlike STRONG_MUTATION_VERBS,
 *  these only count as a mutation when they read as directly acting on
 *  an appointment/booking OBJECT (verb immediately followed by an
 *  optional determiner then "appointment(s)"/"booking(s)"), not merely
 *  co-occurring anywhere in the same sentence as that word. */
const AMBIGUOUS_STATUS_VERB_OBJECT_PATTERN =
  /\b(confirm|approve|reject|decline)\s+(this|that|my|the|an|a)?\s*(appointment|appointments|booking|bookings)\b/;

/** Generic verbs that only mean "mutate an appointment" when paired with
 *  an appointment-context word anywhere in the message — mirrors To-Do's
 *  'add'/'create'/'change'/'move'/'update' over-triggering guard. */
const CONTEXTUAL_MUTATION_VERBS = ['move', 'create', 'add', 'change', 'update', 'assign', 'book'];
const APPOINTMENT_CONTEXT_WORDS = ['appointment', 'appointments', 'booking', 'bookings', 'schedule', 'time', 'date', 'room'];

function isInformationalPhrasing(normalized: string): boolean {
  return INFORMATIONAL_PATTERNS.some((p) => p.test(normalized));
}

function containsMutationOperation(normalized: string): boolean {
  if (STRONG_MUTATION_VERBS.some((v) => new RegExp(`\\b${v}\\b`).test(normalized))) return true;

  if (AMBIGUOUS_STATUS_VERB_OBJECT_PATTERN.test(normalized)) return true;

  const hasContextualVerb = CONTEXTUAL_MUTATION_VERBS.some((v) => new RegExp(`\\b${v}\\b`).test(normalized));
  if (!hasContextualVerb) return false;

  return APPOINTMENT_CONTEXT_WORDS.some((w) => new RegExp(`\\b${w}\\b`).test(normalized));
}

export function isAppointmentMutationRequest(message: string): boolean {
  const normalized = message.trim().toLowerCase().replace(/[?.!]+$/, '');
  if (!normalized) return false;
  if (isInformationalPhrasing(normalized)) return false;
  return containsMutationOperation(normalized);
}
