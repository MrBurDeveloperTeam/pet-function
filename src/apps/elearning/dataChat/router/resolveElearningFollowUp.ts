// Grounded conversational follow-up resolver — Tier C. Tried ONLY when
// classifyElearningDataIntent(msg) returned `no_match` AND the active
// context's `lastIntent === 'elearning_general_video_list'` (the one
// list-bearing intent). Re-resolves the same intent against the CURRENT
// live `['my-videos', userId]` cache entry (never a cached snapshot from
// the earlier turn) via the existing `resolveElearningDataQuery`.

import { resolveElearningDataQuery } from '../resolver/resolveElearningDataQuery';
import type { GroundedConversationContext } from '../context/groundedConversationContext';
import type { ElearningDataChatSources } from '../dataChatSources';

interface GeneralVideoListItemFact {
  title: string;
  status: string;
  viewCount: number;
  createdAt: string;
}

interface GeneralVideoListFacts {
  count: number;
  byStatus: { published: number; processing: number; unlisted: number; removed: number };
  videos: GeneralVideoListItemFact[];
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

const BEST_PERFORMING_PHRASES = ['which performed best', 'which one performed best', 'best performing', 'most views', 'which got the most views'];
const UNLISTED_PHRASES = ['still unlisted', 'which are unlisted', 'unlisted ones', 'only unlisted'];
const COUNT_PHRASES = ['how many of those', 'how many of them'];

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

export interface ElearningFollowUpAnswer {
  text: string;
  presentedOrder: 'display' | 'ranked';
}

export function resolveElearningFollowUp(
  message: string,
  context: GroundedConversationContext | null,
  sources: ElearningDataChatSources
): ElearningFollowUpAnswer | null {
  if (!context || context.lastIntent !== 'elearning_general_video_list') return null;

  const msg = normalize(message);
  if (!msg) return null;

  const result = resolveElearningDataQuery(context.lastIntent, sources);
  if (result.status !== 'ok') return null;

  const facts = result.facts as GeneralVideoListFacts;
  if (facts.videos.length === 0) return null;

  const displayOrder = facts.videos;

  if (mentionsAny(msg, BEST_PERFORMING_PHRASES)) {
    const ranked = [...facts.videos].sort((a, b) => b.viewCount - a.viewCount);
    const top = ranked[0];
    return { text: `"${top.title}" has the most views (${top.viewCount}) among your ${facts.videos.length} shown videos.`, presentedOrder: 'ranked' };
  }

  if (mentionsAny(msg, UNLISTED_PHRASES)) {
    const unlisted = displayOrder.filter((v) => v.status === 'unlisted');
    if (unlisted.length === 0) return { text: 'None of the currently shown videos are unlisted.', presentedOrder: context.presentedOrder };
    const lines = unlisted.map((v, i) => `${i + 1}. ${v.title}`);
    return { text: `Unlisted videos:\n${lines.join('\n')}`, presentedOrder: context.presentedOrder };
  }

  if (mentionsAny(msg, COUNT_PHRASES)) {
    return { text: `${facts.count} video${facts.count === 1 ? '' : 's'} total.`, presentedOrder: context.presentedOrder };
  }

  const activeOrder = context.presentedOrder === 'ranked' ? [...facts.videos].sort((a, b) => b.viewCount - a.viewCount) : displayOrder;
  const idx = detectOrdinalIndex(msg, activeOrder.length);
  if (idx !== null) {
    if (idx < 0 || idx >= activeOrder.length) {
      return { text: `I only have ${activeOrder.length} video${activeOrder.length === 1 ? '' : 's'} in view right now.`, presentedOrder: context.presentedOrder };
    }
    const v = activeOrder[idx];
    return { text: `"${v.title}" — ${v.status}, ${v.viewCount} view${v.viewCount === 1 ? '' : 's'}.`, presentedOrder: context.presentedOrder };
  }

  return null;
}

