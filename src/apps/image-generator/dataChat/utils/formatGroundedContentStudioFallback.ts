// Mandatory deterministic fallback — used ONLY when a deterministic
// provider succeeded (`status: 'ok'`) but the grounded Gemini phrasing
// request itself failed. Renders the full answer directly from the same
// model-safe facts, zero LLM involvement — never falls through to
// legacy General Chat.

import type { ContentStudioDataIntent } from '../contracts/groundedDataResult';
import type { PlanStatusDataFacts } from '../providers/planStatusDataProvider';
import type { RecentGenerationDataFacts } from '../providers/recentGenerationDataProvider';
import type { RecentGenerationsListDataFacts } from '../providers/recentGenerationsListDataProvider';

const PLAN_LABEL: Record<PlanStatusDataFacts['plan'], string> = {
  free: 'Free',
  pro: 'Pro',
  studio: 'Studio',
};

function formatPlanStatus(facts: PlanStatusDataFacts): string {
  return `Your current Content Studio plan is ${PLAN_LABEL[facts.plan]}.`;
}

function formatRecentGeneration(facts: RecentGenerationDataFacts): string {
  if (!facts.hasGeneration) return "You don't have any generations yet.";

  const type = facts.generationType ?? 'content';
  if (facts.status === 'completed') return `Your most recent generation was ${type === 'image' ? 'an' : 'a'} ${type} and it completed successfully.`;
  if (facts.status === 'processing') return `Your most recent ${type} generation is still processing.`;
  if (facts.status === 'failed') return `Your most recent ${type} generation failed.`;
  return `Your most recent generation is a ${type}.`;
}

function pluralize(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function truncationNote(count: number, shownCount: number): string {
  return count > shownCount ? ` Showing ${shownCount} of ${count}.` : '';
}

function formatRecentGenerationsList(facts: RecentGenerationsListDataFacts): string {
  if (facts.count === 0) return "You don't have any recent generations.";
  const breakdownParts = (['completed', 'processing', 'failed'] as const)
    .filter((k) => facts.byStatus[k] > 0)
    .map((k) => `${facts.byStatus[k]} ${k}`);
  const breakdown = breakdownParts.length > 0 ? ` (${breakdownParts.join(', ')})` : '';
  const lines = facts.generations.map((g) => `${g.type} — ${g.status}`);
  return `You have ${pluralize(facts.count, 'recent generation')}${breakdown}.${truncationNote(facts.count, facts.shownCount)}\n${lines.join('\n')}`;
}

export function formatGroundedContentStudioFallback(intent: ContentStudioDataIntent, facts: unknown): string {
  switch (intent) {
    case 'contentstudio_plan_status':
      return formatPlanStatus(facts as PlanStatusDataFacts);
    case 'contentstudio_recent_generation':
      return formatRecentGeneration(facts as RecentGenerationDataFacts);
    case 'contentstudio_recent_generations_list':
      return formatRecentGenerationsList(facts as RecentGenerationsListDataFacts);
    default:
      return "I couldn't format your answer right now.";
  }
}
