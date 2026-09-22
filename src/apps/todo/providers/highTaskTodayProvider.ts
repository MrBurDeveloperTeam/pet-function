// Pure evaluator over the already-loaded `tasks` state — see
// overdueHighTaskProvider.ts for the shared design rationale (no Supabase
// query, reuses App.tsx's already-normalized TaskItem shape).
//
// Eligibility mirrors the Gallery reference's validated High Task Today
// rule (features/petDialogue/providers/taskTodayProvider.ts): incomplete,
// urgency HIGH, due date equals local today exactly. Mutually exclusive
// with Overdue High Task by construction (`===` here vs `<` there against
// the same `todayStr()` value) — a task is never eligible for both.
// `time` is deliberately not used for eligibility or ordering, matching the
// Gallery reference's own documented reasoning: a HIGH task due today stays
// HIGH for the whole local day regardless of any time-of-day value.

import type { TaskItem } from '../types';
import { isValidLocalDateStr, todayStr } from '../dateUtils';
import type { InsightCandidate } from '../contracts/insightCandidate';
import { sanitizeTaskTitle } from '../sanitizeTaskTitle';
import { isTaskLikeType } from './normalTasksTodayProvider';

export interface HighTaskTodayFacts {
  taskId: string;
  title: string | null;
  dueDate: string;
  urgency: 'high';
}

/** Same tie-break as overdueHighTaskProvider.ts: due date (always equal to
 *  today here, kept for shape parity), then created, then id. */
function compareForSelection(a: TaskItem, b: TaskItem): number {
  if (a.created !== b.created) return a.created - b.created;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function qualifyingHighToday(tasks: TaskItem[], today: string): TaskItem[] {
  return tasks.filter((t) =>
    !t.done && isTaskLikeType(t.type) && t.priority === 'high' && isValidLocalDateStr(t.date) && t.date === today
  );
}

function buildCandidateFromTask(winner: TaskItem): InsightCandidate<HighTaskTodayFacts> {
  const safeTitle = sanitizeTaskTitle(winner.title);
  const message = safeTitle
    ? `Your important task "${safeTitle}" is due today.`
    : 'You have an important task due today.';

  const facts: HighTaskTodayFacts = {
    taskId: winner.id,
    title: safeTitle,
    dueDate: winner.date,
    urgency: 'high',
  };

  return {
    app: 'todo',
    triggerId: 'todo_high_today',
    priority: 'MEDIUM',
    facts,
    messageTemplate: 'Your important task "{title}" is due today.',
    message,
    action: { label: 'View Today', view: 'today' },
    dedupeKey: `todo_high_today:${winner.id}:date:${winner.date}`,
    sourceRecordId: winner.id,
    evaluatedAt: new Date().toISOString(),
  };
}

export function evaluateHighTaskToday(tasks: TaskItem[], now: Date = new Date()): InsightCandidate<HighTaskTodayFacts> | null {
  const qualifying = qualifyingHighToday(tasks, todayStr(now));
  if (qualifying.length === 0) return null;

  const winner = [...qualifying].sort(compareForSelection)[0];
  return buildCandidateFromTask(winner);
}

/** Additive ordered pool — see overdueHighTaskProvider.ts's
 *  evaluateOverdueHighTaskCandidates for the same design intent.
 *  `evaluateHighTaskTodayCandidates(tasks)[0]` is always identical to
 *  `evaluateHighTaskToday(tasks)`. */
export function evaluateHighTaskTodayCandidates(tasks: TaskItem[], now: Date = new Date()): InsightCandidate<HighTaskTodayFacts>[] {
  return [...qualifyingHighToday(tasks, todayStr(now))].sort(compareForSelection).map(buildCandidateFromTask);
}
