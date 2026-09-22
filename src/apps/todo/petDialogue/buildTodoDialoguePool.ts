// Dialogue-layer-only pool construction for To-Do's Cat Reminder — sits
// alongside selectDialogueCandidate.ts. Deliberately separate from
// aiExperience/resolver/resolveTodoInsight.ts (the inline
// PersonalizedInsight banner's resolver), which stays completely untouched
// and keeps returning exactly one pure business winner.
//
// Confirmed starvation defect this fixes: resolveTodoInsight.ts reduces
// Overdue High and High Today (both MULTI_RECORD_FAMILY) to ONE winner
// before Cat's dismissal check ever runs. If that winner gets
// Cat-dismissed but is still business-eligible, the next Cat activation
// resolves the exact same winner again, Cat suppresses it again, and a
// second still-eligible task in the SAME family is never reached — Cat
// incorrectly falls through to Welcome Back even though e.g. a second
// overdue HIGH task exists.
//
// Fix: build one ORDERED pool per multi-record family (reusing each
// provider's own existing eligibility/sort/candidate-construction verbatim
// — see evaluateOverdueHighTaskCandidates / evaluateHighTaskTodayCandidates),
// concatenate them in the exact same priority order resolveTodoInsight.ts
// already uses, then append the two aggregate singletons (Normal Tasks
// Today, Nothing Today) last, in that same order, each as a single
// fallback entry — they are NOT exploded into per-task candidates (Normal
// Tasks Today) or given any per-record logic (Nothing Today), per the
// audit's own classification. selectFirstEligibleDialogueCandidate
// (selectDialogueCandidate.ts) then does one linear scan for the first
// not-seen/not-dismissed entry — equivalent to "first eligible candidate
// within a family, else move to the next family" purely because the
// families are concatenated in priority order and the scan is a single
// left-to-right pass.
//
// Building this pool is pure/synchronous (same already-loaded `tasks`
// state the inline banner uses) — no new Supabase query, no browser
// storage read. Only selectFirstEligibleDialogueCandidate (called
// separately, by the caller, once a userId is known) touches
// sessionStorage/localStorage — this file never does.

import { evaluateOverdueHighTaskCandidates } from '../providers/overdueHighTaskProvider';
import { evaluateHighTaskTodayCandidates } from '../providers/highTaskTodayProvider';
import { evaluateNormalTasksToday } from '../providers/normalTasksTodayProvider';
import { evaluateNothingToday } from '../providers/nothingTodayProvider';
import type { InsightCandidate } from '../contracts/insightCandidate';
import type { TaskItem } from '../types';

/**
 * Ordered pool of every candidate Cat may legitimately choose from, in
 * exact resolveTodoInsight.ts family priority order: Overdue High > High
 * Today > Normal Tasks Today > Nothing Today. `pool[0]` (when no
 * suppression is applied) is always identical to `resolveTodoInsight(tasks)`
 * — same eligibility, same tie-breaks, same candidate construction, just
 * not yet collapsed to one winner.
 *
 * Normal Tasks Today / Nothing Today are appended unconditionally (each
 * gated only by their own existing eligibility, not by the record-specific
 * pools being empty) so they remain reachable as Cat's fallback even when
 * record-specific tasks exist but every one of them is already
 * Cat-suppressed. Since Nothing Today's own truthfulness guard already
 * requires zero unresolved dated work, it can only ever be non-null when
 * Normal Tasks Today (and the two record-specific pools) are also empty —
 * so appending both unconditionally never produces two simultaneously
 * "eligible" aggregate entries in practice, and never changes either
 * provider's own eligibility decision.
 */
export function buildTodoDialoguePool(tasks: TaskItem[], now: Date = new Date()): InsightCandidate<unknown>[] {
  const pool: InsightCandidate<unknown>[] = [
    ...evaluateOverdueHighTaskCandidates(tasks, now),
    ...evaluateHighTaskTodayCandidates(tasks, now),
  ];

  const normalToday = evaluateNormalTasksToday(tasks, now);
  if (normalToday) pool.push(normalToday);

  const nothingToday = evaluateNothingToday(tasks, now);
  if (nothingToday) pool.push(nothingToday);

  return pool;
}
