import { sanitizeTaskTitleForDialogue } from '../safeTaskTitle';
import { getTodoAppRoute } from '../knownRoutes';
import { DIALOGUE_ID, PET_DIALOGUE_RULE_VERSION } from '../types';
import type { DialogueCandidate, InsightCandidate } from '../types';
import type { TodoSnapshot } from './todoSnapshotProvider';
import {
  compareByCreatedTimeThenTaskId,
  extractQualifyingHighUrgencyTaskSource,
  type QualifyingHighUrgencyTaskSource,
} from './todoTaskFilters';

/** See expiredInventoryProvider.ts's ExpiredInventoryFacts for the same
 *  design intent. `urgency` is always 'HIGH' by construction — see
 *  todoTaskFilters.ts's extractQualifyingHighUrgencyTaskSource, the only
 *  source of QualifyingHighUrgencyTaskSource values. */
export interface OverdueHighTaskFacts {
  taskId: string;
  title: string | null;
  dueDate: string;
  urgency: 'HIGH';
}

/**
 * Pure P0 (overdue High-priority task) evaluation over the TodoSnapshot —
 * no Supabase access here. A task qualifies only when its validated date is
 * strictly before `localToday`; a task due today is P2 territory
 * (taskTodayProvider.ts), never P0 — the `<` vs `===` comparison against
 * the same validated date key makes the two mutually exclusive by
 * construction, with no separate exclusion set required between them.
 */

function compareSourcesForSelection(a: QualifyingHighUrgencyTaskSource, b: QualifyingHighUrgencyTaskSource): number {
  // Oldest overdue date wins first — a task overdue since 2026-08-01
  // outranks one overdue since 2026-08-04.
  if (a.validatedDateKey !== b.validatedDateKey) return a.validatedDateKey < b.validatedDateKey ? -1 : 1;

  // created_at, then task id — see todoTaskFilters.ts for why a
  // missing/malformed created_at must not silently win this tie.
  return compareByCreatedTimeThenTaskId(a, b);
}

function buildCandidateFromSource(source: QualifyingHighUrgencyTaskSource): InsightCandidate<OverdueHighTaskFacts> {
  const safeTitle = sanitizeTaskTitleForDialogue(source.title);
  const message = safeTitle ? `Your urgent task "${safeTitle}" is overdue.` : 'You have an overdue urgent task.';
  const messageTemplate = 'Your urgent task "{title}" is overdue.';

  const evaluatedAt = new Date().toISOString();
  const facts: OverdueHighTaskFacts = {
    taskId: source.taskId,
    title: source.title,
    dueDate: source.validatedDateKey,
    urgency: 'HIGH',
  };

  return {
    app: 'todo',
    triggerId: DIALOGUE_ID.OVERDUE_HIGH_TASK,
    facts,
    messageTemplate,
    sourceRecordId: source.taskId,
    evaluatedAt,
    userState: 'ACTIVE_USER_URGENT',
    dialogueId: DIALOGUE_ID.OVERDUE_HIGH_TASK,
    priority: 'P0',
    message,
    action: { label: 'View Task', route: getTodoAppRoute() },
    source: {
      app: 'todo',
      recordId: source.taskId,
      evaluatedAt,
    },
    dedupeKey: `overdue_high_task:${source.taskId}:date:${source.validatedDateKey}`,
    ruleVersion: PET_DIALOGUE_RULE_VERSION,
    // Consistent with the existing P0 (expired inventory): overdue is
    // urgent enough to bypass the cosmetic entry walk, and does not
    // auto-close.
    bypassEntryWalk: true,
    eventTime: source.validatedDateKey,
    createdTime: source.createdTime ?? undefined,
    recordId: source.taskId,
  };
}

export interface OverdueTaskEvaluation {
  candidate: DialogueCandidate | null;
  /** Every independently eligible Overdue High Task candidate, in the same
   *  business order compareSourcesForSelection already produces —
   *  `candidates[0]` is always identical to `candidate` above. Additive
   *  only. */
  candidates: DialogueCandidate[];
  /** Every task id that qualifies as overdue-High, not just the selected
   *  winner — exposed for parity with the inventory evaluators' exclusion
   *  pattern, even though nothing currently needs to exclude by it (P0/P2
   *  are already mutually exclusive by date). */
  qualifyingTaskIds: Set<string>;
}

export function evaluateOverdueHighTask(snapshot: TodoSnapshot, localToday: string): OverdueTaskEvaluation {
  const sources: QualifyingHighUrgencyTaskSource[] = [];

  for (const task of snapshot.tasks) {
    const source = extractQualifyingHighUrgencyTaskSource(task);
    if (!source) continue;
    if (source.validatedDateKey < localToday) sources.push(source);
  }

  if (sources.length === 0) {
    return { candidate: null, candidates: [], qualifyingTaskIds: new Set() };
  }

  const ordered = [...sources].sort(compareSourcesForSelection);
  const candidates = ordered.map(buildCandidateFromSource);
  return {
    candidate: candidates[0] ?? null,
    candidates,
    qualifyingTaskIds: new Set(sources.map((s) => s.taskId)),
  };
}
