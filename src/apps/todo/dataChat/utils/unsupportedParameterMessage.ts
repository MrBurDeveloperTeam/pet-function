// Deterministic local responses for recognized-but-unsupported To-Do data
// questions (see ../router/classifyTodoDataIntent.ts's
// `unsupported_parameter`/`unsupported_scope` route results). Zero Gemini
// calls in either case, and neither falls through to General Chat — see
// this feature's routing order in App.tsx/MolarAIFloat.jsx.

export function buildUnsupportedParameterMessage(reason: 'date_range' | 'priority_filter'): string {
  if (reason === 'date_range') {
    return "I can't filter tasks by custom date ranges in data chat yet. I can check overdue high-priority tasks, high-priority tasks today, all of today's tasks, or a task summary.";
  }
  return "I can't filter tasks by custom priority levels in data chat yet. I can check overdue high-priority tasks, high-priority tasks today, all of today's tasks, or a task summary.";
}

export function buildUnsupportedScopeMessage(_reason: 'completion_history'): string {
  return "Completed-today history isn't available in data chat yet.";
}
