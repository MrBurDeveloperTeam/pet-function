// LLM-based semantic capability router — see Todo's
// matchTodoCapabilityLLM.ts for the full architecture rationale. Never
// throws to its caller; any failure resolves to `{type:'unavailable'}`
// so the adapter falls back to the local keyword matcher
// (matchElearningCapability.ts).

import type { ElearningChatServices } from '../../transport';
import { ELEARNING_CAPABILITIES } from './capabilityRegistry';
import type { ElearningDataIntent } from '../contracts/groundedDataResult';

export type ElearningLLMRouteResult =
  | { type: 'grounded_capability'; capability: ElearningDataIntent }
  | { type: 'clarification'; text: string }
  | { type: 'general_chat' }
  | { type: 'unavailable' };

const ALLOWED_CAPABILITY_IDS: ReadonlySet<string> = new Set(ELEARNING_CAPABILITIES.map((c) => c.id));

export function createElearningCapabilityMatcher(routeElearningCapability: ElearningChatServices['routeElearningCapability']) {
return async function matchElearningCapabilityLLM(
  message: string,
  recentContext: string[],
  previousCapability: string | null
): Promise<ElearningLLMRouteResult> {
  try {
    const result = await routeElearningCapability(
      message,
      ELEARNING_CAPABILITIES.map((c) => ({ id: c.id, description: c.description })),
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

    return { type: 'grounded_capability', capability: result.capability as ElearningDataIntent };
  } catch {
    return { type: 'unavailable' };
  }
};
}

