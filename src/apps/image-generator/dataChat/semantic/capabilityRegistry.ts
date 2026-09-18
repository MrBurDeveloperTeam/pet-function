// Capability registry — what Molar AI can actually answer in Content
// Studio, independent of any specific phrasing. Deliberately narrow
// keywords — general creative-assistant conversation ("give me content
// ideas", "improve my prompt") must NOT accidentally score against any
// of these and get routed into Data Chat; none of the keywords below
// overlap that kind of phrasing.

import type { ContentStudioDataIntent } from '../contracts/groundedDataResult';

export interface ContentStudioCapability {
  id: ContentStudioDataIntent;
  description: string;
  keywords: string[];
}

export const CONTENT_STUDIO_CAPABILITIES: ContentStudioCapability[] = [
  {
    id: 'contentstudio_plan_status',
    description: 'Which subscription plan the user currently has.',
    keywords: ['my plan', 'which plan', 'plan status', 'subscription'],
  },
  {
    id: 'contentstudio_recent_generation',
    description: "The single most recent generation's status.",
    keywords: ['last generation', 'most recent generation', 'my latest work', 'what did i just generate'],
  },
  {
    id: 'contentstudio_recent_generations_list',
    description: 'A list of recent generations with a status breakdown.',
    keywords: ['recent generations', 'still processing', 'anything failed', 'generation history', 'recent activity', 'recent work'],
  },
];
