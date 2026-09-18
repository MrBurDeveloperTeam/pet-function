// Capability registry — what Molar AI can actually answer in E-learning,
// independent of any specific phrasing. Deliberately excludes any
// viewer-identity concept ("who watched") — that guard is a
// deterministic pattern check run BEFORE this layer is ever reached (see
// classifyElearningDataIntent.ts), and no capability keyword below
// overlaps it.

import type { ElearningDataIntent } from '../contracts/groundedDataResult';

export interface ElearningCapability {
  id: ElearningDataIntent;
  description: string;
  keywords: string[];
}

export const ELEARNING_CAPABILITIES: ElearningCapability[] = [
  {
    id: 'elearning_latest_video_performance',
    description: "The creator's most recently published video's view count.",
    keywords: ['latest video', 'newest video', 'recent video', 'just uploaded', 'last upload'],
  },
  {
    id: 'elearning_most_viewed_video',
    description: "The creator's single best-performing video by views.",
    keywords: ['most viewed', 'best performing', 'most popular', 'did best', 'performing well'],
  },
  {
    id: 'elearning_followed_creator_updates',
    description: 'New unread videos from creators the viewer follows.',
    keywords: ['creators i follow', 'people i follow', 'anything new from', 'new from creators'],
  },
  {
    id: 'elearning_general_video_list',
    description: "All of the creator's own uploaded videos, any status.",
    keywords: ['uploaded', 'my videos', 'video list', 'all my content', 'unlisted videos'],
  },
];


