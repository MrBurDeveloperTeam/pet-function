// Grounded conversational follow-up resolver — Tier C. Tried ONLY when
// classifyContentStudioDataIntent(msg) returned `no_match` AND the
// active context's `lastIntent === 'contentstudio_recent_generations_list'`.
// Re-resolves the same intent against the CURRENT live snapshot (never a
// cached snapshot from the earlier turn).
//
// "Why did they fail?" is deliberately answered HONESTLY, not invented —
// this app's already-loaded `Generation` rows carry a `status`, never a
// provider-level failure reason (see recentGenerationsListDataProvider.ts's
// own model-safe facts shape) — there is nothing truthful to say beyond
// "the status is known, the detailed reason isn't."

import { resolveContentStudioDataQuery } from '../resolver/resolveContentStudioDataQuery';
import type { GroundedConversationContext } from '../context/groundedConversationContext';
import type { ContentStudioDataChatSnapshot } from '../../ContentStudioDataChatProvider';

interface RecentGenerationsListItemFact {
  type: string;
  status: 'processing' | 'completed' | 'failed';
  createdAt: string;
}

interface RecentGenerationsListFacts {
  count: number;
  shownCount: number;
  byStatus: { processing: number; completed: number; failed: number };
  generations: RecentGenerationsListItemFact[];
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

const WHY_FAILED_PHRASES = ['why did they fail', 'why did it fail', 'why failed'];
const LATEST_PHRASES = ['which was the latest', 'which is the latest', 'most recent one'];
const SUCCESSFUL_PHRASES = ['successful ones', 'the successful ones', 'which succeeded', 'completed ones'];
const LAST_THREE_PHRASES = ['last three', 'the last 3', 'show me the last three', 'show me the last 3'];
const COUNT_PHRASES = ['how many of those', 'how many of them'];

export function resolveContentStudioFollowUp(
  message: string,
  context: GroundedConversationContext | null,
  snapshot: ContentStudioDataChatSnapshot,
  userId: string | null
): string | null {
  if (!context || context.lastIntent !== 'contentstudio_recent_generations_list') return null;

  const msg = normalize(message);
  if (!msg) return null;

  const result = resolveContentStudioDataQuery(context.lastIntent, snapshot, userId);
  if (result.status !== 'ok') return null;

  const facts = result.facts as RecentGenerationsListFacts;
  if (facts.generations.length === 0) return null;

  if (mentionsAny(msg, WHY_FAILED_PHRASES)) {
    if (facts.byStatus.failed === 0) return "None of your recent generations are marked as failed.";
    return "I can see the failed status, but the detailed provider error isn't available here. Try re-running the generation, or check that your prompt follows the content guidelines -- if it keeps failing, that usually points to an unsupported prompt or a temporary provider issue.";
  }

  if (mentionsAny(msg, LATEST_PHRASES)) {
    const latest = [...facts.generations].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
    return `Your most recent one is a ${latest.type} generation — ${latest.status}.`;
  }

  if (mentionsAny(msg, SUCCESSFUL_PHRASES)) {
    const completed = facts.generations.filter((g) => g.status === 'completed');
    if (completed.length === 0) return "None of the currently shown generations completed successfully.";
    const lines = completed.map((g, i) => `${i + 1}. ${g.type} generation`);
    return `Completed generations:\n${lines.join('\n')}`;
  }

  if (mentionsAny(msg, LAST_THREE_PHRASES)) {
    const lastThree = facts.generations.slice(0, 3);
    const lines = lastThree.map((g, i) => `${i + 1}. ${g.type} — ${g.status}`);
    return lines.join('\n');
  }

  if (mentionsAny(msg, COUNT_PHRASES)) {
    return `${facts.count} generation${facts.count === 1 ? '' : 's'} total.`;
  }

  return null;
}
