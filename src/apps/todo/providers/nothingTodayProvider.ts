// Pure evaluator over the already-loaded `tasks` state — no Supabase
// query. This is the positive "all caught up" fallback, and it must be
// factually safe: it does NOT simply mean "the other three candidates
// returned null" (which would incorrectly fire this message while e.g. a
// non-HIGH overdue task still sits unresolved — see the truthfulness guard
// below).
//
// Eligibility (both must hold, regardless of priority):
//   A. zero incomplete tasks with a valid date strictly before local today
//   B. zero incomplete tasks with a valid date equal to local today
// i.e. zero incomplete tasks with a valid date <= today. Priority is
// deliberately never consulted — an overdue/due-today MEDIUM, NORMAL, or
// unknown-priority task suppresses this message exactly the same as an
// overdue/due-today HIGH task would (even though a HIGH one would already
// have won a different, higher-priority candidate first). This function
// does not create any new visible "overdue normal task" candidate — it
// only uses the check to decide whether the neutral fallback is truthful.
//
// Undated tasks (no valid `date`) are never counted by this guard, exactly
// mirroring how overdueHighTaskProvider.ts / highTaskTodayProvider.ts /
// normalTasksTodayProvider.ts all also only ever consider tasks with a
// valid date — there is no source-proven "undated = due today" semantics
// anywhere in this app, so this message's factual claim ("caught up for
// today") is scoped to dated work only, and remains true even if undated
// incomplete tasks exist.

import type { TaskItem } from '../types';
import { todayStr } from '../dateUtils';
import type { InsightCandidate } from '../contracts/insightCandidate';

export interface NothingTodayFacts {
  date: string;
}

export function evaluateNothingToday(tasks: TaskItem[]): InsightCandidate<NothingTodayFacts> | null {
  const today = todayStr();

  const hasUnresolvedDatedWork = tasks.some((t) => !t.done && !!t.date && t.date <= today);
  if (hasUnresolvedDatedWork) return null;

  const facts: NothingTodayFacts = { date: today };

  return {
    app: 'todo',
    triggerId: 'todo_nothing_today',
    priority: 'INFO',
    facts,
    messageTemplate: "You're all caught up for today.",
    message: "You're all caught up for today.",
    // No action — a positive status message, not an alert; no existing
    // action was established for this surface beyond "View Today", which
    // would be pointless to offer when there is nothing there to see.
    dedupeKey: `todo_nothing_today:date:${today}`,
    // No backing record at all — this candidate represents the absence of
    // qualifying records, never a fabricated id.
    sourceRecordId: null,
    evaluatedAt: new Date().toISOString(),
  };
}
