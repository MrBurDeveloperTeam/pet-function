// Pure evaluator over the already-loaded `tasks` state. No task rows are
// ever produced by this provider — only aggregate counts, each derived
// from the exact same eligibility rules as the other three Data Chat
// providers (never a second, independently-drifting definition).
//
// `sourceRecordIds` is intentionally left EMPTY for Summary: including
// every open task's id would add payload size with no real traceability
// benefit for an aggregate answer (there is no single "the record this
// answer is about" the way a list intent has) — this mirrors the same
// decision already made for the sibling Inventory repo's Summary
// provider. `sourceRecordIds` is never sent to Gemini regardless (see
// ../contracts/groundedDataResult.ts), this is purely about whether the
// local result object itself carries the ids.

import type { TaskItem } from '../../types';
import { todayStr } from '../../dateUtils';
import { isTaskLikeType } from '../../providers/normalTasksTodayProvider';

export interface SummaryDataFacts {
  openTaskCount: number;
  overdueHighCount: number;
  highTodayCount: number;
  todayCount: number;
}

export function buildSummaryDataFacts(tasks: TaskItem[]): SummaryDataFacts {
  const today = todayStr();

  let openTaskCount = 0;
  let overdueHighCount = 0;
  let highTodayCount = 0;
  let todayCount = 0;

  for (const t of tasks) {
    if (t.done || !isTaskLikeType(t.type)) continue;

    openTaskCount += 1;

    if (t.priority === 'high' && !!t.date && t.date < today) overdueHighCount += 1;
    if (t.priority === 'high' && t.date === today) highTodayCount += 1;
    if (t.date === today) todayCount += 1;
  }

  return { openTaskCount, overdueHighCount, highTodayCount, todayCount };
}

