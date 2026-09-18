// LLM-based semantic capability router — see Todo's
// matchTodoCapabilityLLM.ts for the full architecture rationale. Never
// throws to its caller; any failure resolves to `{type:'unavailable'}`
// so the adapter falls back to the local keyword matcher
// (matchContentStudioCapability.ts). General creative-assistant
// conversation ("give me content ideas") is explicitly instructed to
// route to general_chat server-side (see route.ts's system prompt), and
// even if it somehow didn't, an unmatched/invalid capability here still
// resolves to 'unavailable' -> falls to the local matcher -> falls to
// General Chat, never a forced grounded answer.

import type { ContentStudioChatServices } from '../../transport';
import { CONTENT_STUDIO_CAPABILITIES } from './capabilityRegistry';
import type { ContentStudioDataIntent } from '../contracts/groundedDataResult';

export type ContentStudioLLMRouteResult =
  | { type: 'grounded_capability'; capability: ContentStudioDataIntent }
  | { type: 'clarification'; text: string }
  | { type: 'general_chat' }
  | { type: 'unavailable' };

const ALLOWED_CAPABILITY_IDS: ReadonlySet<string> = new Set(CONTENT_STUDIO_CAPABILITIES.map((c) => c.id));

export function createContentStudioCapabilityMatcher(routeContentStudioCapability: ContentStudioChatServices['routeContentStudioCapability']) {
return async function matchContentStudioCapabilityLLM(
  message: string,
  recentContext: string[],
  previousCapability: string | null
): Promise<ContentStudioLLMRouteResult> {
  try {
    const result = await routeContentStudioCapability(
      message,
      CONTENT_STUDIO_CAPABILITIES.map((c) => ({ id: c.id, description: c.description })),
      recentContext,
      previousCapability
    );

    if (result.route === 'general_chat') return { type: 'general_chat' };

    if (result.route === 'clarification') {
      if (typeof result.clarification !== 'string' || !result.clarification.trim()) {
        return { type: 'unavailable' };
      }
      return { type: 'clarification', text: result.clarification };
    }

    if (!result.capability || !ALLOWED_CAPABILITY_IDS.has(result.capability)) {
      return { type: 'unavailable' };
    }

    return { type: 'grounded_capability', capability: result.capability as ContentStudioDataIntent };
  } catch {
    return { type: 'unavailable' };
  }
}

}
