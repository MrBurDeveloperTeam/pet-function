// Response-composition layer shared by the SUCCESSFUL-Gemini path and the
// deterministic-fallback path so both render the SAME authoritative local
// task details. Gemini supplies only the generic overview/count sentence
// (it never receives titles, see geminiService.ts's chatWithGroundedTodoFacts);
// the numbered task list always comes from `localDisplay`, which was built
// from the exact same capped/ordered provider output the model's facts were
// derived from. This helper makes zero network calls.
//
// Summary intent has no per-task list — pass-through only.

import type { TodoDataIntent } from '../contracts/groundedDataResult';
import type { LocalTaskListDisplay } from './localTaskDisplay';
import { formatLocalTaskList } from './formatGroundedTodoFallback';

const LIST_INTENTS: ReadonlySet<TodoDataIntent> = new Set([
  'todo_overdue_high',
  'todo_overdue',
  'todo_high_today',
  'todo_today',
  'todo_upcoming',
]);

export function composeGroundedTodoResponse(
  intent: TodoDataIntent,
  modelOverview: string,
  localDisplay: LocalTaskListDisplay | undefined
): string {
  if (!LIST_INTENTS.has(intent)) return modelOverview;
  return `${modelOverview}${formatLocalTaskList(localDisplay)}`;
}

