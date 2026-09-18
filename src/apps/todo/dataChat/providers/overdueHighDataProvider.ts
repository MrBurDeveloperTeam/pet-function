// Pure evaluator over the already-loaded `tasks` state (no Supabase
// query). Eligibility mirrors overdueHighTaskProvider.ts EXACTLY —
// task-like, incomplete, priority 'high', valid due date strictly before
// local today — reused, not reimplemented.
//
// MODEL-SAFE FACTS: `{count, shownCount, tasks: [{taskId, dueDate,
// priority}]}` — deliberately NO `title`. Task titles are free-form
// user-authored text (may contain personal reminders, patient-adjacent
// details, clinic-specific notes) and are handled by a SEPARATE local-only
// display layer (`../utils/localTaskDisplay.ts`) that never crosses into
// the Gemini payload — see ../contracts/groundedDataResult.ts's
// `localDisplay` doc comment for the full two-layer boundary rationale.

import type { TaskItem } from '../../types';
import { todayStr } from '../../dateUtils';
import { isTaskLikeType } from '../../providers/normalTasksTodayProvider';
import { buildLocalTaskListDisplay, type LocalTaskListDisplay } from '../utils/localTaskDisplay';

const MAX_LIST_ITEMS = 5;

export interface OverdueHighDataItemFact {
  taskId: string;
  dueDate: string;
  priority: 'high';
}

export interface OverdueHighDataFacts {
  count: number;
  shownCount: number;
  tasks: OverdueHighDataItemFact[];
}

/** Identical tie-break to overdueHighTaskProvider.ts: oldest due date
 *  first, then earliest created, then task id — never array/query order. */
function compareForOrdering(a: TaskItem, b: TaskItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.created !== b.created) return a.created - b.created;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildOverdueHighDataFacts(tasks: TaskItem[]): {
  facts: OverdueHighDataFacts;
  localDisplay: LocalTaskListDisplay;
  sourceRecordIds: string[];
} {
  const today = todayStr();

  const qualifying = tasks.filter(
    (t) => !t.done && isTaskLikeType(t.type) && t.priority === 'high' && !!t.date && t.date < today
  );

  const ordered = [...qualifying].sort(compareForOrdering);
  const shown = ordered.slice(0, MAX_LIST_ITEMS);

  const facts: OverdueHighDataFacts = {
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

