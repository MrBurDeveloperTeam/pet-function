// Pure evaluator over the already-loaded `tasks` state. Eligibility
// mirrors highTaskTodayProvider.ts EXACTLY (plus the same explicit
// task-like restriction applied to all four Phase-3 v1 intents — see
// overdueHighDataProvider.ts's file header) — task-like, incomplete,
// priority 'high', due date equals local today.
//
// MODEL-SAFE FACTS: no `title` — see overdueHighDataProvider.ts's file
// header for the full two-layer title privacy boundary.

import type { TaskItem } from '../../types';
import { todayStr } from '../../dateUtils';
import { isTaskLikeType } from '../../providers/normalTasksTodayProvider';
import { buildLocalTaskListDisplay, type LocalTaskListDisplay } from '../utils/localTaskDisplay';

const MAX_LIST_ITEMS = 5;

export interface HighTodayDataItemFact {
  taskId: string;
  dueDate: string;
  priority: 'high';
}

export interface HighTodayDataFacts {
  count: number;
  shownCount: number;
  tasks: HighTodayDataItemFact[];
}

/** All qualifying tasks share the same `date` (today), so ordering is
 *  effectively just the stable tie-break: earliest `created`, then task
 *  id — matches highTaskTodayProvider.ts's own convention exactly. */
function compareForOrdering(a: TaskItem, b: TaskItem): number {
  if (a.created !== b.created) return a.created - b.created;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildHighTodayDataFacts(tasks: TaskItem[]): {
  facts: HighTodayDataFacts;
  localDisplay: LocalTaskListDisplay;
  sourceRecordIds: string[];
} {
  const today = todayStr();

  const qualifying = tasks.filter(
    (t) => !t.done && isTaskLikeType(t.type) && t.priority === 'high' && t.date === today
  );

  const ordered = [...qualifying].sort(compareForOrdering);
  const shown = ordered.slice(0, MAX_LIST_ITEMS);

  const facts: HighTodayDataFacts = {
    count: qualifying.length,
    shownCount: shown.length,
    tasks: shown.map((t) => ({ taskId: t.id, dueDate: t.date, priority: 'high' })),
  };

  return {
    facts,
    localDisplay: buildLocalTaskListDisplay(shown),
    sourceRecordIds: shown.map((t) => t.id),
  };
}

