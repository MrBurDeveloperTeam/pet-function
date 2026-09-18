// Capability registry — describes what Molar AI can actually answer in
// this app, independent of any specific phrasing. Consumed by
// matchTodoCapability.ts's local semantic matcher, tried AFTER
// classifyTodoDataIntent's fast-path phrase table returns `no_match` and
// BEFORE falling through to General Chat (see Section 16 of the
// Semantic Grounded Routing Enhancement: phrase tables become an
// optimization/compatibility layer, not the only entry point).
//
// `keywords` are the significant terms/short phrases a user's own words
// are matched against — NOT a second copy of every possible sentence.
// Deliberately excludes `todo_overdue_high`/`todo_high_today` (their
// "high priority" qualifier is a real parameter the matcher would have
// to disambiguate from plain "overdue"/"today", which the existing
// fast-path already handles reliably) — the semantic layer covers the
// capabilities most likely to be asked in genuinely novel phrasing.

import type { TodoDataIntent } from '../contracts/groundedDataResult';

export interface TodoCapability {
  id: TodoDataIntent;
  description: string;
  keywords: string[];
}

export const TODO_CAPABILITIES: TodoCapability[] = [
  {
    id: 'todo_overdue',
    description: 'List or summarize tasks whose due date has passed and are not completed.',
    keywords: [
      'overdue',
      'behind',
      'late',
      'missed',
      'past due',
      'should have finished',
      'havent done',
    ],
  },
  {
    id: 'todo_upcoming',
    description: 'List or summarize future tasks that are due soon or upcoming.',
    keywords: [
      'upcoming',
      'coming up',
      'due soon',
      'whats next',
      'what next',
      'anything next',
      'future task',
      'ahead',
    ],
  },
  {
    id: 'todo_today',
    description: 'Tasks due today.',
    keywords: ['today', 'on my plate', 'finish today', 'due today', 'this day'],
  },
  {
    id: 'todo_summary',
    description: 'Overall task workload summary / what needs attention.',
    keywords: [
      'summary',
      'summarize',
      'workload',
      'how am i doing',
      'am i behind',
      'whats my situation',
      'needs attention',
      'overview',
    ],
  },
];

