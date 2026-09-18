// Pure evaluator over the already-loaded `['my-videos', userId]` React
// Query cache entry (see ../hooks/useElearningDataChatSources.ts — no
// Supabase query here; `fetchMyVideos` already enforces
// `creator_id = userId` at the source).
//
// UNLIKE Latest/Most-Viewed (published+public only): this intent answers
// "which videos have I uploaded" for the OWNER's OWN creator studio view,
// so it deliberately includes every status (`processing`, `published`,
// `unlisted`, `removed`) — matching exactly what Studio.tsx itself shows
// the creator, never a narrower public-facing eligibility filter.
//
// MODEL-SAFE FACTS: `{count, shownCount, byStatus, videos:[{title,
// status, viewCount, createdAt}]}`. `title` is safe to send to Gemini
// here — it is the creator's OWN self-authored text describing their OWN
// video, the same category of already-app-visible content the
// Followed-Creator-Updates provider already sends as `creatorDisplayName`
// (../followedCreatorUpdatesDataProvider.ts) — not a third party's PII.

import type { VideoWithCreator } from '../../types';

const MAX_LIST_ITEMS = 8;

export interface GeneralVideoListItemFact {
  title: string;
  status: VideoWithCreator['status'];
  viewCount: number;
  createdAt: string;
}

export interface GeneralVideoListDataFacts {
  count: number;
  shownCount: number;
  byStatus: { published: number; processing: number; unlisted: number; removed: number };
  videos: GeneralVideoListItemFact[];
}

function compareForOrdering(a: VideoWithCreator, b: VideoWithCreator): number {
  const aMs = Date.parse(a.created_at);
  const bMs = Date.parse(b.created_at);
  if (aMs !== bMs) return bMs - aMs;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildGeneralVideoListDataFacts(
  videos: VideoWithCreator[] | undefined
): { facts: GeneralVideoListDataFacts; sourceRecordIds: string[] } {
  const rows = videos ?? [];

  const byStatus = { published: 0, processing: 0, unlisted: 0, removed: 0 };
  for (const v of rows) {
    if (v.status in byStatus) byStatus[v.status as keyof typeof byStatus] += 1;
  }

  const ordered = [...rows].sort(compareForOrdering);
  const shown = ordered.slice(0, MAX_LIST_ITEMS);

  const facts: GeneralVideoListDataFacts = {
    count: rows.length,
    shownCount: shown.length,
    byStatus,
    videos: shown.map((v) => ({
      title: v.title,
      status: v.status,
      viewCount: v.view_count,
      createdAt: v.created_at,
    })),
  };

  return { facts, sourceRecordIds: shown.map((v) => v.id) };
}


