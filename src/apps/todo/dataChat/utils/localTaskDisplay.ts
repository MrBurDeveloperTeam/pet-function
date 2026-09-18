// LOCAL-ONLY sanitized display metadata — this is the "two-layer title
// privacy boundary" (see ../contracts/groundedDataResult.ts's
// `localDisplay` doc comment). Task titles are free-form user-authored
// text that may contain personal reminders, patient-adjacent details, or
// other sensitive content — `sanitizeTaskTitle` (the existing, browser-
// validated Phase-2A sanitizer) only strips formatting hazards for local
// rendering safety; it does NOT make free-form content safe to send to an
// external model. The output of this function must NEVER be passed into
// `chatWithGroundedTodoFacts` or any Gemini system instruction/user
// payload — see App.tsx's/MolarAIFloat's integration for the enforced
// boundary.

import type { TaskItem } from '../../types';
import { sanitizeTaskTitle } from '../../sanitizeTaskTitle';

export interface LocalTaskDisplayEntry {
  taskId: string;
  sanitizedTitle: string;
  dueDate: string;
}

export interface LocalTaskListDisplay {
  tasks: LocalTaskDisplayEntry[];
}

/** `tasks` here is already the SAME shown-subset (already capped, already
 *  ordered) a provider selected — this function does no filtering/
 *  ordering of its own, it only builds the local-only display shape. */
export function buildLocalTaskListDisplay(shownTasks: TaskItem[]): LocalTaskListDisplay {
  return {
    tasks: shownTasks.map((task) => ({
      taskId: task.id,
      sanitizedTitle: sanitizeTaskTitle(task.title) ?? 'Untitled task',
      dueDate: task.date,
    })),
  };
}

