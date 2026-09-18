// Future due-date tasks — the mirror of overdueDataProvider.ts on the
// other side of "today": task-like, incomplete, valid due date STRICTLY
// AFTER local today (today itself is `todo_today`'s own concept, never
// double-counted here). Added for the Semantic Grounded Routing
// Enhancement's flagship regression case ("Is there any up coming
// task?") — this capability genuinely did not exist before; it is not
// merely a routing gap.
//
// Dataset-oriented per the same established convention as
// overdueDataProvider.ts: one provider exposes the full upcoming set
// PLUS a per-priority breakdown, ordered soonest-first.
//
// MODEL-SAFE FACTS: `{count, shownCount, byPriority:{high,med,low,none},
// tasks:[{taskId, dueDate, priority}]}` — deliberately NO `title`, same
// two-layer boundary as every other list provider in this directory.

import type { TaskItem } from '../../types';
import { todayStr } from '../../dateUtils';
import { isTaskLikeType } from '../../providers/normalTasksTodayProvider';
import { buildLocalTaskListDisplay, type LocalTaskListDisplay } from '../utils/localTaskDisplay';

const MAX_LIST_ITEMS = 5;

export interface UpcomingDataItemFact {
  taskId: string;
  dueDate: string;
  priority: TaskItem['priority'];
}

export interface UpcomingDataFacts {
  count: number;
  shownCount: number;
  byPriority: { high: number; med: number; low: number; none: number };
  tasks: UpcomingDataItemFact[];
}

/** Soonest due date first, then earliest created, then task id — never
 *  array/query order. Mirrors overdueDataProvider.ts's own tie-break. */
function compareForOrdering(a: TaskItem, b: TaskItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.created !== b.created) return a.created - b.created;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildUpcomingDataFacts(tasks: TaskItem[]): {
  facts: UpcomingDataFacts;
  localDisplay: LocalTaskListDisplay;
  sourceRecordIds: string[];
} {
  const today = todayStr();

  const qualifying = tasks.filter((t) => !t.done && isTaskLikeType(t.type) && !!t.date && t.date > today);

  const byPriority = { high: 0, med: 0, low: 0, none: 0 };
  for (const t of qualifying) {
    const key = (t.priority ?? 'none') as keyof typeof byPriority;
    if (key in byPriority) byPriority[key] += 1;
    else byPriority.none += 1;
  }

  const ordered = [...qualifying].sort(compareForOrdering);
  const shown = ordered.slice(0, MAX_LIST_ITEMS);

  const facts: UpcomingDataFacts = {
    count: qualifying.length,
    shownCount: shown.length,
    byPriority,
    tasks: shown.map((t) => ({ taskId: t.id, dueDate: t.date, priority: t.priority })),
  };

  return {
    facts,
    localDisplay: buildLocalTaskListDisplay(shown),
    sourceRecordIds: shown.map((t) => t.id),
  };
}

