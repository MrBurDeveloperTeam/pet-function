// Mandatory deterministic fallback — used ONLY when a deterministic
// provider succeeded (`status: 'ok'`) but the grounded Gemini phrasing
// request itself failed. Per the Phase-3 pilot design (already
// browser-validated in the sibling Inventory repo), a Gemini failure at
// this stage must NEVER fall through to General Chat — this formatter
// renders BOTH the count/summary wording AND the sanitized local task
// list directly from the same structured data, with zero LLM
// involvement. Task titles here come exclusively from `localDisplay`
// (already sanitized via sanitizeTaskTitle) — never from Gemini, and
// this function itself never sends anything anywhere.

import type { TodoDataIntent } from '../contracts/groundedDataResult';
import type { OverdueHighDataFacts } from '../providers/overdueHighDataProvider';
import type { OverdueDataFacts } from '../providers/overdueDataProvider';
import type { UpcomingDataFacts } from '../providers/upcomingDataProvider';
import type { HighTodayDataFacts } from '../providers/highTodayDataProvider';
import type { TodayDataFacts } from '../providers/todayDataProvider';
import type { SummaryDataFacts } from '../providers/summaryDataProvider';
import type { LocalTaskListDisplay } from './localTaskDisplay';

function pluralize(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function truncationNote(count: number, shownCount: number): string {
  return count > shownCount ? ` Showing ${shownCount} of ${count}.` : '';
}

// Exported so `composeGroundedTodoResponse.ts` can append the SAME
// authoritative local task list to a successful grounded Gemini overview —
// the success and failure paths must render identical local task details.
export function formatLocalTaskList(localDisplay: LocalTaskListDisplay | undefined): string {
  if (!localDisplay || localDisplay.tasks.length === 0) return '';
  const lines = localDisplay.tasks.map((t, i) => `${i + 1}. ${t.sanitizedTitle} — ${t.dueDate}`);
  return `\n${lines.join('\n')}`;
}

function formatOverdueHigh(facts: OverdueHighDataFacts, localDisplay: LocalTaskListDisplay | undefined): string {
  if (facts.count === 0) return 'No overdue high-priority tasks were found.';
  return `You have ${pluralize(facts.count, 'overdue high-priority task')}.${truncationNote(facts.count, facts.shownCount)}${formatLocalTaskList(localDisplay)}`;
}

function formatOverdue(facts: OverdueDataFacts, localDisplay: LocalTaskListDisplay | undefined): string {
  if (facts.count === 0) return "You don't have any overdue tasks.";
  const breakdownParts = (['high', 'med', 'low', 'none'] as const)
    .filter((k) => facts.byPriority[k] > 0)
    .map((k) => `${facts.byPriority[k]} ${k === 'none' ? 'unprioritized' : k}`);
  const breakdown = breakdownParts.length > 0 ? ` (${breakdownParts.join(', ')})` : '';
  return `You have ${pluralize(facts.count, 'overdue task')}${breakdown}.${truncationNote(facts.count, facts.shownCount)}${formatLocalTaskList(localDisplay)}`;
}

function formatHighToday(facts: HighTodayDataFacts, localDisplay: LocalTaskListDisplay | undefined): string {
  if (facts.count === 0) return 'You have no high-priority tasks due today.';
  return `You have ${pluralize(facts.count, 'high-priority task')} due today.${truncationNote(facts.count, facts.shownCount)}${formatLocalTaskList(localDisplay)}`;
}

function formatToday(facts: TodayDataFacts, localDisplay: LocalTaskListDisplay | undefined): string {
  if (facts.count === 0) return 'You have no incomplete tasks due today.';
  return `You have ${pluralize(facts.count, 'incomplete task')} due today.${truncationNote(facts.count, facts.shownCount)}${formatLocalTaskList(localDisplay)}`;
}

function formatUpcoming(facts: UpcomingDataFacts, localDisplay: LocalTaskListDisplay | undefined): string {
  if (facts.count === 0) return "You don't have any upcoming tasks.";
  const breakdownParts = (['high', 'med', 'low', 'none'] as const)
    .filter((k) => facts.byPriority[k] > 0)
    .map((k) => `${facts.byPriority[k]} ${k === 'none' ? 'unprioritized' : k}`);
  const breakdown = breakdownParts.length > 0 ? ` (${breakdownParts.join(', ')})` : '';
  return `You have ${pluralize(facts.count, 'upcoming task')}${breakdown}.${truncationNote(facts.count, facts.shownCount)}${formatLocalTaskList(localDisplay)}`;
}

function formatSummary(facts: SummaryDataFacts): string {
  return (
    `Task summary: ${pluralize(facts.openTaskCount, 'open task')}, ` +
    `${facts.overdueHighCount} overdue high-priority, ` +
    `${facts.highTodayCount} high-priority today, ` +
    `${facts.todayCount} due today.`
  );
}

export function formatGroundedTodoFallback(
  intent: TodoDataIntent,
  facts: unknown,
  localDisplay: unknown
): string {
  switch (intent) {
    case 'todo_overdue_high':
      return formatOverdueHigh(facts as OverdueHighDataFacts, localDisplay as LocalTaskListDisplay | undefined);
    case 'todo_overdue':
      return formatOverdue(facts as OverdueDataFacts, localDisplay as LocalTaskListDisplay | undefined);
    case 'todo_high_today':
      return formatHighToday(facts as HighTodayDataFacts, localDisplay as LocalTaskListDisplay | undefined);
    case 'todo_today':
      return formatToday(facts as TodayDataFacts, localDisplay as LocalTaskListDisplay | undefined);
    case 'todo_upcoming':
      return formatUpcoming(facts as UpcomingDataFacts, localDisplay as LocalTaskListDisplay | undefined);
    case 'todo_summary':
      return formatSummary(facts as SummaryDataFacts);
    default:
      return "I couldn't format your task answer right now.";
  }
}

