// Grounded conversational follow-up resolver — Tier C of the 5-tier
// routing model (Safety -> Grounded App Data -> Grounded Follow-Up ->
// General Conversation -> Honest Limitation). Tried ONLY when
// classifyTodoDataIntent(msg) returned `no_match` AND an active
// GroundedConversationContext exists from a prior list-bearing grounded
// answer (todo_overdue_high/todo_overdue/todo_high_today/todo_today).
//
// REVALIDATION (Section 14): every follow-up re-resolves the SAME
// `lastIntent` against the CURRENT live `tasks` array via the existing
// `resolveTodoDataQuery` — never a cached snapshot from the earlier
// turn. If a task was completed/deleted since, it is naturally excluded
// again by the same eligibility rule the original provider already
// enforces.
//
// DETERMINISTIC, NOT GEMINI: ranking/why/ordinal/filter/count answers
// are all computed locally from already-model-safe-shaped facts
// (priority/dueDate/taskId) plus the existing LOCAL-ONLY sanitized
// title display layer — title never crosses into a Gemini call here,
// matching Todo's existing two-layer privacy boundary exactly. No new
// Gemini call is made for these follow-ups at all — "which one should I
// do first" must never let a model invent which task exists.
//
// Deliberately NOT another giant exact-phrase command table — a small
// set of phrase/word cues, checked against the CURRENT grounded dataset,
// covers the required follow-up shapes without per-question intents.

import { resolveTodoDataQuery } from '../resolver/resolveTodoDataQuery';
import type { GroundedConversationContext } from '../context/groundedConversationContext';
import type { TodoDataIntent, TaskDataStatus } from '../contracts/groundedDataResult';
import type { TaskItem } from '../../types';

const LIST_INTENTS: ReadonlySet<TodoDataIntent> = new Set([
  'todo_overdue_high',
  'todo_overdue',
  'todo_high_today',
  'todo_today',
]);

const PRIORITY_RANK: Record<string, number> = { high: 0, med: 1, low: 2, none: 3 };

interface MergedTask {
  taskId: string;
  sanitizedTitle: string;
  dueDate: string;
  priority: TaskItem['priority'];
}

interface TodoListFacts {
  count: number;
  byPriority?: { high: number; med: number; low: number; none: number };
  tasks: { taskId: string; dueDate: string; priority: TaskItem['priority'] }[];
}

interface TodoLocalDisplay {
  tasks: { taskId: string; sanitizedTitle: string; dueDate: string }[];
}

function mergeTaskFactsAndDisplay(facts: TodoListFacts, localDisplay: TodoLocalDisplay | undefined): MergedTask[] {
  const titleById = new Map((localDisplay?.tasks ?? []).map((t) => [t.taskId, t.sanitizedTitle]));
  return facts.tasks.map((t) => ({
    taskId: t.taskId,
    dueDate: t.dueDate,
    priority: t.priority,
    sanitizedTitle: titleById.get(t.taskId) ?? 'Untitled task',
  }));
}

/** Deterministic ranking: priority first (high > med > low > none), then
 *  oldest due date (most overdue first), then task id as a stable
 *  tie-break — never array/query order. */
function rankedOrder(tasks: MergedTask[]): MergedTask[] {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority ?? 'none'] ?? 3;
    const pb = PRIORITY_RANK[b.priority ?? 'none'] ?? 3;
    if (pa !== pb) return pa - pb;
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    return a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0;
  });
}

function describePriority(p: TaskItem['priority']): string {
  if (p === 'high') return 'high';
  if (p === 'med') return 'medium';
  if (p === 'low') return 'low';
  return 'unset';
}

function normalize(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mentionsAny(msg: string, phrases: string[]): boolean {
  return phrases.some((p) => msg.includes(p));
}

const RANK_PHRASES = [
  'which one should i do first',
  'which should i do first',
  'what should i do first',
  'which one is most important',
  'which is most important',
  'what should i focus on',
  'which one is highest priority',
  'which is highest priority',
  'what should i do next',
  'which is next',
  'which one is next',
  'most urgent',
  'which one is the priority',
  'which one first',
];
const WHY_PHRASES = ['why', 'why that one', 'why him', 'why her', 'why is that', 'why that'];
const COUNT_PHRASES = [
  'how many of those',
  'how many of them',
  'how many are high priority',
  'how many high priority',
];
const FILTER_HIGH_PHRASES = [
  'only high priority',
  'just high priority',
  'show me the high priority',
  'high priority ones',
  'show me only the high priority',
];

const ORDINAL_WORDS: Array<[string, number]> = [
  ['first', 0],
  ['second', 1],
  ['third', 2],
  ['fourth', 3],
  ['fifth', 4],
  ['last', -1],
];

function detectOrdinalIndex(msg: string, listLength: number): number | null {
  for (const [word, idx] of ORDINAL_WORDS) {
    if (msg.includes(word)) {
      if (idx === -1) return listLength > 0 ? listLength - 1 : null;
      return idx;
    }
  }
  return null;
}

export interface TodoFollowUpAnswer {
  text: string;
  presentedOrder: 'display' | 'ranked';
}

export function resolveTodoFollowUp(
  message: string,
  context: GroundedConversationContext | null,
  tasks: TaskItem[],
  taskDataStatus: TaskDataStatus
): TodoFollowUpAnswer | null {
  if (!context || !LIST_INTENTS.has(context.lastIntent)) return null;

  const msg = normalize(message);
  if (!msg) return null;

  // Revalidate live -- never answer against a stale snapshot.
  const result = resolveTodoDataQuery(context.lastIntent, tasks, taskDataStatus);
  if (result.status !== 'ok') return null;

  const facts = result.facts as TodoListFacts;
  const merged = mergeTaskFactsAndDisplay(facts, result.localDisplay as TodoLocalDisplay | undefined);
  if (merged.length === 0) return null;

  const displayOrder = merged;
  const ranked = rankedOrder(merged);

  if (mentionsAny(msg, RANK_PHRASES)) {
    const top = ranked[0];
    return {
      text: `I'd start with "${top.sanitizedTitle}" — it's ${describePriority(top.priority)} priority and due ${top.dueDate}.`,
      presentedOrder: 'ranked',
    };
  }

  if (WHY_PHRASES.includes(msg) || msg.startsWith('why ')) {
    const activeOrder = context.presentedOrder === 'ranked' ? ranked : displayOrder;
    const top = activeOrder[0];
    if (!top) return null;
    return {
      text: `"${top.sanitizedTitle}" is ${describePriority(top.priority)} priority and has been due since ${top.dueDate}, so it's the one most worth tackling first.`,
      presentedOrder: context.presentedOrder,
    };
  }

  if (mentionsAny(msg, COUNT_PHRASES)) {
    const highCount = facts.byPriority?.high ?? merged.filter((t) => t.priority === 'high').length;
    return {
      text: `${highCount} of your ${facts.count} overdue task${facts.count === 1 ? '' : 's'} ${highCount === 1 ? 'is' : 'are'} high priority.`,
      presentedOrder: context.presentedOrder,
    };
  }

  if (mentionsAny(msg, FILTER_HIGH_PHRASES)) {
    const highOnes = displayOrder.filter((t) => t.priority === 'high');
    if (highOnes.length === 0) {
      return { text: 'None of the currently shown tasks are high priority.', presentedOrder: context.presentedOrder };
    }
    const lines = highOnes.map((t, i) => `${i + 1}. ${t.sanitizedTitle} — due ${t.dueDate}`);
    return { text: `High-priority tasks:\n${lines.join('\n')}`, presentedOrder: context.presentedOrder };
  }

  const activeOrderForOrdinal = context.presentedOrder === 'ranked' ? ranked : displayOrder;
  const idx = detectOrdinalIndex(msg, activeOrderForOrdinal.length);
  if (idx !== null) {
    if (idx < 0 || idx >= activeOrderForOrdinal.length) {
      return {
        text: `I only have ${activeOrderForOrdinal.length} task${activeOrderForOrdinal.length === 1 ? '' : 's'} in view right now.`,
        presentedOrder: context.presentedOrder,
      };
    }
    const t = activeOrderForOrdinal[idx];
    return {
      text: `"${t.sanitizedTitle}" is ${describePriority(t.priority)} priority and due ${t.dueDate}.`,
      presentedOrder: context.presentedOrder,
    };
  }

  return null;
}

