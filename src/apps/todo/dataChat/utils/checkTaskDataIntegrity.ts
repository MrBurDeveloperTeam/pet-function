// Data-Driven Chat's OWN, defensive integrity check — deliberately NOT a
// change to Phase-2A's proactive eligibility rules (overdueHighTaskProvider.ts
// etc. are untouched). Direct factual "what's overdue?"-style answers have
// a stronger completeness requirement than a proactive banner.
//
// RISK LEVEL (evidence-based, lower than the sibling Inventory repo):
// `public.tasks.date` is confirmed LIVE as a genuine Postgres `date`-typed
// column (verified via a read-only `information_schema` query against the
// connected Supabase project during the Phase-3 readiness pass) — not a
// free-text field the way Inventory's batch `expiryDate` was. Postgres
// itself rejects a non-date value at INSERT/UPDATE time, so a non-null
// `TaskItem.date` should never actually be malformed through normal
// application write paths. This check remains purely DEFENSE-IN-DEPTH
// (negligible cost, matches this project's established "trust but verify"
// pattern for any externally-sourced value) rather than a confirmed
// active risk.
//
// A legitimately absent due date (`null`/`undefined`/empty string) is a
// real, allowed "no due date recorded" task state and is never flagged —
// only a NON-EMPTY value that fails the exact local-date-key pattern
// already used by every Phase-2A provider (`toLocalDateStr`/`todayStr` in
// ../../../utils.ts) is treated as malformed/unevaluable.

import type { TaskItem } from '../../types';

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Returns `true` if any task-like, incomplete task has a non-empty
 *  `date` that doesn't match the exact `YYYY-MM-DD` local-date-key shape
 *  every Phase-2A provider already relies on (`t.date < today` /
 *  `t.date === today` string comparisons). Only task-like/incomplete rows
 *  are checked, since only those participate in any of the four v1
 *  intents' date-dependent eligibility. */
export function hasMalformedTaskDate(tasks: TaskItem[]): boolean {
  for (const task of tasks) {
    if (task.done) continue;
    const raw = task.date;
    const isPresent = typeof raw === 'string' && raw.trim().length > 0;
    if (!isPresent) continue; // legitimately absent — not malformed
    if (!DATE_KEY_PATTERN.test(raw)) return true;
  }
  return false;
}

