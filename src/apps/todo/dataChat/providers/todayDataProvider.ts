// Pure evaluator over the already-loaded `tasks` state.
//
// DIRECT-QA SCOPE — deliberately BROADER than Phase-2A's proactive
// "Normal Tasks Today" (normalTasksTodayProvider.ts), which excludes High
// Today tasks only because High Today already owns its own separate
// proactive banner slot (mutual exclusivity is a PROACTIVE
// presentation concern, not a factual one). A user directly asking "What
// tasks do I have today?" would be misled if a genuinely due-today
// high-priority task were silently omitted — see the Phase-3 readiness
// pass's explicit recommendation. Eligibility here is simply: task-like,
// incomplete, due date equals local today — ANY priority.
//
// MODEL-SAFE FACTS: no `title` — see overdueHighDataProvider.ts's file
// header for the full two-layer title privacy boundary.

import type { TaskItem, Priority } from '../../types';
import { todayStr } from '../../dateUtils';
import { isTaskLikeType } from '../../providers/normalTasksTodayProvider';
import { buildLocalTaskListDisplay, type LocalTaskListDisplay } from '../utils/localTaskDisplay';

const MAX_LIST_ITEMS = 5;

export interface TodayDataItemFact {
  taskId: string;
  dueDate: string;
  priority: Priority;
}

export interface TodayDataFacts {
  count: number;
  shownCount: number;
  tasks: TodayDataItemFact[];
}

/** High priority first (the most operationally significant tasks lead
 *  the answer), then earliest `created`, then task id — stable, never
 *  array/query order, and never task title as a sort key. */
function compareForOrdering(a: TaskItem, b: TaskItem): number {
  const aHigh = a.priority === 'high' ? 0 : 1;
  const bHigh = b.priority === 'high' ? 0 : 1;
  if (aHigh !== bHigh) return aHigh - bHigh;
  if (a.created !== b.created) return a.created - b.created;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildTodayDataFacts(tasks: TaskItem[]): {
  facts: TodayDataFacts;
  localDisplay: LocalTaskListDisplay;
  sourceRecordIds: string[];
} {
  const today = todayStr();

  const qualifying = tasks.filter((t) => !t.done && isTaskLikeType(t.type) && t.date === today);

  const ordered = [...qualifying].sort(compareForOrdering);
  const shown = ordered.slice(0, MAX_LIST_ITEMS);

  const facts: TodayDataFacts = {
    count: qualifying.length,
    shownCount: shown.length,
    tasks: shown.map((t) => ({ taskId: t.id, dueDate: t.date, priority: t.priority })),
  };

  return {
    facts,
    localDisplay: buildLocalTaskListDisplay(shown),
    sourceRecordIds: shown.map((t) => t.id),
  };
}

