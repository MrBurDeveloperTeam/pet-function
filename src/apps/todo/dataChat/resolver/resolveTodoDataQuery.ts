// Deterministic dispatcher: approved intent -> pure grounded provider ->
// GroundedDataResult. No Supabase query here — reuses the exact same
// `tasks`/`taskDataStatus` state App.tsx already owns (passed in by the
// caller).
//
// READINESS: `taskDataStatus !== 'ready'` short-circuits to
// `status: 'unavailable'` (`reasonCode: 'loading'` or `'data_error'`)
// BEFORE any provider runs — unknown task state is never reinterpreted
// as a zero-result answer. This applies even when `tasks.length === 0`:
// "ready + []" is a genuine known-empty state; "loading/error + []" is
// unknown, never zero.
//
// INTEGRITY GATE: `hasMalformedTaskDate` (defensive — see
// ../utils/checkTaskDataIntegrity.ts for why this is low-probability
// given `tasks.date` is a live-confirmed Postgres `date` column) blocks
// ALL FOUR intents uniformly if it ever fires, since every one of them
// depends on date classification (directly, or via `overdueHighCount`/
// `highTodayCount`/`todayCount` for Summary).

import { hasMalformedTaskDate } from '../utils/checkTaskDataIntegrity';
import { buildOverdueHighDataFacts } from '../providers/overdueHighDataProvider';
import { buildOverdueDataFacts } from '../providers/overdueDataProvider';
import { buildUpcomingDataFacts } from '../providers/upcomingDataProvider';
import { buildHighTodayDataFacts } from '../providers/highTodayDataProvider';
import { buildTodayDataFacts } from '../providers/todayDataProvider';
import { buildSummaryDataFacts } from '../providers/summaryDataProvider';
import type { GroundedDataResult, TodoDataIntent, TaskDataStatus } from '../contracts/groundedDataResult';
import type { TaskItem } from '../../types';

export function resolveTodoDataQuery(
  intent: TodoDataIntent,
  tasks: TaskItem[],
  taskDataStatus: TaskDataStatus
): GroundedDataResult<unknown, unknown> {
  const evaluatedAt = new Date().toISOString();

  if (taskDataStatus === 'loading') {
    return { status: 'unavailable', intent, reasonCode: 'loading', evaluatedAt };
  }
  if (taskDataStatus === 'error') {
    return { status: 'unavailable', intent, reasonCode: 'data_error', evaluatedAt };
  }

  try {
    if (hasMalformedTaskDate(tasks)) {
      return { status: 'unavailable', intent, reasonCode: 'evaluation_error', evaluatedAt };
    }

    switch (intent) {
      case 'todo_overdue_high': {
        const { facts, localDisplay, sourceRecordIds } = buildOverdueHighDataFacts(tasks);
        return { status: 'ok', intent, facts, localDisplay, evaluatedAt, sourceRecordIds };
      }
      case 'todo_overdue': {
        const { facts, localDisplay, sourceRecordIds } = buildOverdueDataFacts(tasks);
        return { status: 'ok', intent, facts, localDisplay, evaluatedAt, sourceRecordIds };
      }
      case 'todo_high_today': {
        const { facts, localDisplay, sourceRecordIds } = buildHighTodayDataFacts(tasks);
        return { status: 'ok', intent, facts, localDisplay, evaluatedAt, sourceRecordIds };
      }
      case 'todo_today': {
        const { facts, localDisplay, sourceRecordIds } = buildTodayDataFacts(tasks);
        return { status: 'ok', intent, facts, localDisplay, evaluatedAt, sourceRecordIds };
      }
      case 'todo_upcoming': {
        const { facts, localDisplay, sourceRecordIds } = buildUpcomingDataFacts(tasks);
        return { status: 'ok', intent, facts, localDisplay, evaluatedAt, sourceRecordIds };
      }
      case 'todo_summary': {
        const facts = buildSummaryDataFacts(tasks);
        return { status: 'ok', intent, facts, evaluatedAt, sourceRecordIds: [] };
      }
      default: {
        // Exhaustiveness guard — every TodoDataIntent member is handled
        // above; this only fires if that union is ever widened without
        // updating this switch, and is caught below like any other
        // evaluation failure.
        throw new Error(`Unhandled TodoDataIntent: ${intent as string}`);
      }
    }
  } catch (err) {
    console.warn('[dataChat] todo data query evaluation failed:', err);
    return { status: 'unavailable', intent, reasonCode: 'evaluation_error', evaluatedAt };
  }
}

