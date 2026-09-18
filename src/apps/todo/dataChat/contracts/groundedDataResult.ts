// To-Do — local Data-Driven Chat grounded-answer contract.
//
// Deliberately NOT `InsightCandidate` (../../contracts/insightCandidate.ts)
// — Personalized Insight picks ONE proactive candidate among several
// competing triggers; Data-Driven Chat answers one specific, user-selected
// question 1:1, with no "competing for a single slot" semantics. The
// underlying pure eligibility logic (overdueHighTaskProvider.ts,
// highTaskTodayProvider.ts, normalTasksTodayProvider.ts's `isTaskLikeType`,
// todayStr/toLocalDateStr, sanitizeTaskTitle) IS shared with Personalized
// Insight — only the outer contract differs, on purpose, mirroring the
// exact same distinction already browser-validated in the sibling
// Inventory repo's Phase-3 pilot. This is this repo's OWN independently-
// typed definition — no cross-repo package.

export type TodoDataIntent =
  | 'todo_overdue_high'
  | 'todo_overdue'
  | 'todo_high_today'
  | 'todo_today'
  | 'todo_summary'
  | 'todo_upcoming';

/**
 * `status: 'ok'` — the deterministic provider evaluated successfully.
 * `facts` may still describe a truthful ZERO result (e.g. `count: 0`) —
 * zero is a known fact, not an error.
 *
 * `facts` is the ONLY thing ever sent to Gemini for grounded phrasing —
 * see each provider's own file header for the exact model-safe shape
 * (never task title/description/notes/user_id/full task row).
 *
 * `localDisplay` is OPTIONAL, LOCAL-ONLY, sanitized display metadata
 * (e.g. `{ tasks: [{ taskId, sanitizedTitle }] }` — see
 * ../utils/localTaskDisplay.ts). It exists so the final rendered chat
 * response can still tell the user WHICH tasks matched, without task
 * titles ever crossing the boundary into the Gemini call. It must NEVER
 * be included in the grounded Gemini payload, system instruction, or any
 * logging sent to an external model — see
 * ../../../services/geminiService.ts's `chatWithGroundedTodoFacts`.
 *
 * `status: 'unavailable'` — task state was not evaluable:
 *   - `'loading'`: the authenticated task fetch has not yet resolved.
 *   - `'data_error'`: the task fetch itself failed.
 *   - `'evaluation_error'`: task state loaded, but a defensive integrity
 *     check (e.g. an unexpected malformed non-empty due date) refused to
 *     let a date-dependent intent proceed.
 * NEVER reinterpreted as a zero/negative factual claim.
 */
export type GroundedDataResult<TFacts, TLocalDisplay = undefined> =
  | {
      status: 'ok';
      intent: TodoDataIntent;
      facts: TFacts;
      localDisplay?: TLocalDisplay;
      evaluatedAt: string;
      sourceRecordIds: string[];
    }
  | {
      status: 'unavailable';
      intent: TodoDataIntent;
      reasonCode: 'loading' | 'data_error' | 'evaluation_error';
      evaluatedAt: string;
    };

/**
 * Application-level readiness state for the authenticated `tasks` fetch
 * (App.tsx's own `syncUserAndDataFromDatabase`). Added specifically
 * because the existing architecture could not otherwise distinguish
 * "still loading", "fetch failed", and "successfully loaded, zero tasks"
 * — all three previously looked identical (`tasks === []`). This is the
 * smallest instrumentation of the EXISTING task-loading flow — no new
 * Supabase query is introduced by this type or its usage.
 */
export type TaskDataStatus = 'loading' | 'ready' | 'error';

