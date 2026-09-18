// General "overdue" — ANY priority, not just high (see
// overdueHighDataProvider.ts's own narrower sibling, kept unchanged and
// still used for the dedicated "overdue high-priority" phrasing). Same
// eligibility rule as every other date-dependent intent in this
// directory: task-like, incomplete, valid due date strictly before local
// today.
//
// Dataset-oriented per Section 11 of the flexibility refinement phase:
// one provider exposes the full overdue set PLUS a per-priority
// breakdown, so "what's overdue", "overdue count", "overdue low
// priority", "highest-priority overdue task" can all be answered from
// this SAME authoritative facts object instead of one narrow intent per
// exact phrasing.
//
// MODEL-SAFE FACTS: `{count, shownCount, byPriority:{high,med,low,none},
// tasks:[{taskId, dueDate, priority}]}` — deliberately NO `title`, same
// two-layer boundary as overdueHighDataProvider.ts (see
// ../utils/localTaskDisplay.ts).

import type { TaskItem } from '../../types';
import { todayStr } from '../../dateUtils';
import { isTaskLikeType } from '../../providers/normalTasksTodayProvider';
import { buildLocalTaskListDisplay, type LocalTaskListDisplay } from '../utils/localTaskDisplay';

const MAX_LIST_ITEMS = 5;

export interface OverdueDataItemFact {
  taskId: string;
  dueDate: string;
  priority: TaskItem['priority'];
}

export interface OverdueDataFacts {
  count: number;
  shownCount: number;
  byPriority: { high: number; med: number; low: number; none: number };
  tasks: OverdueDataItemFact[];
}

/** Identical tie-break to overdueHighDataProvider.ts: oldest due date
 *  first, then earliest created, then task id — never array/query order. */
function compareForOrdering(a: TaskItem, b: TaskItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.created !== b.created) return a.created - b.created;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildOverdueDataFacts(tasks: TaskItem[]): {
  facts: OverdueDataFacts;
  localDisplay: LocalTaskListDisplay;
  sourceRecordIds: string[];
} {
  const today = todayStr();

  const qualifying = tasks.filter((t) => !t.done && isTaskLikeType(t.type) && !!t.date && t.date < today);

  const byPriority = { high: 0, med: 0, low: 0, none: 0 };
  for (const t of qualifying) {
    const key = (t.priority ?? 'none') as keyof typeof byPriority;
    if (key in byPriority) byPriority[key] += 1;
    else byPriority.none += 1;
  }

  const ordered = [...qualifying].sort(compareForOrdering);
  const shown = ordered.slice(0, MAX_LIST_ITEMS);

  const facts: OverdueDataFacts = {
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

