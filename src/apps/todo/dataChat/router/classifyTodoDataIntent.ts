// Deterministic LOCAL intent router — no Gemini call for classification.
// A small closed phrase-table for exactly the four approved v1 intents.
// If nothing matches, the caller falls through unchanged to the existing
// predefined-response/General Chat pipeline — this router never attempts
// broad natural-language understanding, and never lets the model choose
// which provider/data scope to access.

import type { TodoDataIntent } from '../contracts/groundedDataResult';

function mentionsAny(normalized: string, phrases: string[]): boolean {
  return phrases.some((phrase) => normalized.includes(phrase));
}

/** "overdue" alone is deliberately NOT sufficient for `todo_overdue_high`
 *  — see `classifyTodoDataIntent`'s `unsupported_scope('broad_overdue')`
 *  branch below. A qualifier proving the user means the HIGH-priority
 *  subset is required. */
function mentionsHighQualifier(normalized: string): boolean {
  return mentionsAny(normalized, ['high', 'urgent', 'important']);
}

function mentionsOverdue(normalized: string): boolean {
  return normalized.includes('overdue');
}

/** Broader natural phrasings for the same "overdue" concept (Section 12
 *  flexibility pass) — all resolve from the exact same authoritative
 *  overdueDataProvider.ts dataset as the literal word "overdue" does;
 *  no new capability, only recognizing more ways of asking for it. */
const OVERDUE_SYNONYM_PHRASES = ['behind on', 'tasks are late', 'what am i late on', "anything i've missed", 'anything i missed'];

function mentionsOverdueSynonym(normalized: string): boolean {
  return mentionsOverdue(normalized) || mentionsAny(normalized, OVERDUE_SYNONYM_PHRASES);
}

function mentionsToday(normalized: string): boolean {
  return normalized.includes('today');
}

/** Fast-path phrases for the future-due-date capability (Semantic
 *  Grounded Routing Enhancement's flagship regression case) — a
 *  compatibility layer only; the semantic capability matcher
 *  (../semantic/matchTodoCapability.ts) is what actually generalizes
 *  beyond these exact strings (e.g. "Is there any up coming task?" after
 *  local whitespace normalization below). */
const UPCOMING_PHRASES = [
  'upcoming task',
  'upcoming tasks',
  'anything upcoming',
  'any upcoming',
  'due soon',
  'coming up',
  'what do i have next',
  "what's next",
  'whats next',
];

function mentionsUpcoming(normalized: string): boolean {
  return mentionsAny(normalized, UPCOMING_PHRASES);
}

const SUMMARY_PHRASES = [
  'task summary',
  'summarize my',
  'how many tasks',
  'to-do status',
  'todo status',
  'task status',
  'give me a summary',
  'what needs attention',
  'whats my situation',
];

function mentionsSummary(normalized: string): boolean {
  return mentionsAny(normalized, SUMMARY_PHRASES);
}

const COMPLETION_HISTORY_PHRASES = [
  'what did i complete',
  'what have i completed',
  'completed today',
  'complete today',
  'tasks i completed',
  'completion history',
];

function mentionsCompletionHistory(normalized: string): boolean {
  return mentionsAny(normalized, COMPLETION_HISTORY_PHRASES);
}

/** Unsupported date-range parameters — the fixed v1 rule only supports
 *  the exact calendar date "today" (Today/High Today) or "before today"
 *  (Overdue High). A message asking for a different/relative window must
 *  never be silently answered under today's fixed rule, and must never
 *  be allowed to dynamically construct a Supabase/date filter. */
const UNSUPPORTED_DATE_RANGE_PATTERNS: RegExp[] = [
  /\bnext\s+\d+\s+days?\b/,
  /\bbefore\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  /\bthis\s+week\b/,
  /\bthis\s+month\b/,
  /\btomorrow\b/,
  /\byesterday\b/,
];

function mentionsUnsupportedDateRange(normalized: string): boolean {
  return UNSUPPORTED_DATE_RANGE_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** Unsupported priority filters — v1 only distinguishes "high" (Overdue
 *  High / High Today) vs. "any priority, due today" (Today). A request
 *  for a specific non-high priority tier is a real filtering criterion
 *  this pilot cannot honor and must not silently ignore. */
const UNSUPPORTED_PRIORITY_FILTER_PATTERN = /\b(low priority|medium priority|med priority|priority\s*\d+|only\s+(low|medium|med)\b)/;

function mentionsUnsupportedPriorityFilter(normalized: string): boolean {
  return UNSUPPORTED_PRIORITY_FILTER_PATTERN.test(normalized);
}

export type TodoDataRouteResult =
  | { kind: 'matched'; intent: TodoDataIntent }
  | { kind: 'unsupported_parameter'; reason: 'date_range' | 'priority_filter' }
  | { kind: 'unsupported_scope'; reason: 'completion_history' }
  | { kind: 'no_match' };

/** Local whitespace/spelling normalization for obvious variants — NOT a
 *  synonym engine (Section 17 of the Semantic Grounded Routing
 *  Enhancement explicitly asks for this to stay lightweight). The
 *  broader "not the exact word" cases are handled by the semantic
 *  capability matcher, not by growing this list. */
function normalizeSpacingVariants(message: string): string {
  return message.replace(/\bup\s+coming\b/g, 'upcoming');
}

export function classifyTodoDataIntent(message: string): TodoDataRouteResult {
  const normalized = normalizeSpacingVariants(message.trim().toLowerCase());
  if (!normalized) return { kind: 'no_match' };

  // Completion-history is checked FIRST — "What did I complete today?"
  // must never be mistaken for the Today intent merely because it
  // contains the word "today".
  if (mentionsCompletionHistory(normalized)) {
    return { kind: 'unsupported_scope', reason: 'completion_history' };
  }

  // Unsupported filter dimensions are checked BEFORE intent matching —
  // e.g. "What are my low-priority tasks today?" must not be silently
  // answered as plain Today (which means ANY priority), since the
  // priority qualifier changes the actual criterion being asked about.
  // EXEMPT when the question is also about "overdue": todo_overdue's
  // facts now include a full per-priority breakdown (see
  // overdueDataProvider.ts), so "overdue low priority tasks" is safely
  // answerable from that same dataset instead of being blocked.
  if (mentionsUnsupportedPriorityFilter(normalized) && !mentionsOverdueSynonym(normalized)) {
    return { kind: 'unsupported_parameter', reason: 'priority_filter' };
  }
  if (mentionsUnsupportedDateRange(normalized)) {
    return { kind: 'unsupported_parameter', reason: 'date_range' };
  }

  if (mentionsOverdueSynonym(normalized)) {
    if (mentionsHighQualifier(normalized)) {
      return { kind: 'matched', intent: 'todo_overdue_high' };
    }
    // Any priority (or a specific non-high priority, or none stated at
    // all) — todo_overdue's facts include a full priority breakdown so
    // the response still honestly reflects a low/medium-specific
    // question. Previously `unsupported_scope('broad_overdue')` —
    // Section 4/12 of the flexibility refinement phase explicitly asks
    // for this to be answerable.
    return { kind: 'matched', intent: 'todo_overdue' };
  }

  if (mentionsUpcoming(normalized)) {
    return { kind: 'matched', intent: 'todo_upcoming' };
  }

  if (mentionsToday(normalized) && mentionsHighQualifier(normalized)) {
    return { kind: 'matched', intent: 'todo_high_today' };
  }

  if (mentionsToday(normalized)) {
    return { kind: 'matched', intent: 'todo_today' };
  }

  if (mentionsSummary(normalized)) {
    return { kind: 'matched', intent: 'todo_summary' };
  }

  return { kind: 'no_match' };
}

