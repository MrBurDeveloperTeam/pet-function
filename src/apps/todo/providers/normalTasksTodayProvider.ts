// Pure aggregate evaluator over the already-loaded `tasks` state — no
// Supabase query, reuses App.tsx's already-normalized TaskItem shape (see
// overdueHighTaskProvider.ts for the shared design rationale).
//
// Eligibility: at least one incomplete, task-like item due today, ANY
// priority. This deliberately does NOT exclude whichever task (if any)
// already won High Task Today — the resolver (resolveTodoInsight.ts)
// already guarantees High Task Today is checked and returned first, so
// this provider is only ever actually consulted once no HIGH task today
// exists; adding exclusion filtering here would duplicate that guarantee
// for no behavioral benefit (Phase-2A task instruction: do not build
// "exclude the winner" logic merely for resolver compatibility).
//
// "Task-like" (`isTaskLikeType` below) means `type === 'task'` OR
// `type` is absent/null/empty — the latter covers legacy rows from before
// `type` existed. This deliberately excludes `type === 'event'`/`'reminder'`
// records: Normal Tasks Today represents actual tasks, and Event/Reminder
// Soon remains explicitly out of scope (no time-window semantics defined,
// no proven live usage) — an event/reminder due today must not be silently
// counted as a "task scheduled for today". Note App.tsx's own load-time
// mapping already coalesces a missing Supabase `type` column to `'task'`
// (`type: t.type || 'task'`), so in practice `TaskItem.type` is rarely if
// ever null here — the absent/empty branch below is kept anyway as a
// defensive match for the current TaskItem representation, per this
// correction's own scope.

import type { TaskItem } from '../types';
import { todayStr } from '../dateUtils';
import type { InsightCandidate } from '../contracts/insightCandidate';

export interface NormalTasksTodayFacts {
  count: number;
  date: string;
}

/** Exported (Phase-3 addition — purely additive, no behavior change) so
 *  aiExperience/dataChat/ providers can reuse this exact task-like
 *  classification instead of reimplementing a second copy of it. */
export function isTaskLikeType(type: TaskItem['type'] | null | undefined): boolean {
  if (!type) return true;
  return type === 'task';
}

export function evaluateNormalTasksToday(tasks: TaskItem[]): InsightCandidate<NormalTasksTodayFacts> | null {
  const today = todayStr();

  const qualifying = tasks.filter((t) => !t.done && isTaskLikeType(t.type) && t.date === today);
  if (qualifying.length === 0) return null;

  const count = qualifying.length;
  const message = count === 1
    ? 'You have 1 task scheduled for today.'
    : `You have ${count} tasks scheduled for today.`;

  const facts: NormalTasksTodayFacts = { count, date: today };

  return {
    app: 'todo',
    triggerId: 'todo_normal_tasks_today',
    priority: 'LOW',
    facts,
    messageTemplate: 'You have {count} task(s) scheduled for today.',
    message,
    action: { label: 'View Today', view: 'today' },
    dedupeKey: `todo_normal_tasks_today:date:${today}:count:${count}`,
    // Aggregate — no single backing record, per the contract's nullable
    // sourceRecordId semantics.
    sourceRecordId: null,
    evaluatedAt: new Date().toISOString(),
  };
}
