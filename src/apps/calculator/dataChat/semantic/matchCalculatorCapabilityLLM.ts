// LLM-based semantic capability router — see Todo's
// matchTodoCapabilityLLM.ts for the full architecture rationale. Never
// throws to its caller; any failure resolves to `{type:'unavailable'}`
// so the adapter falls back to the local keyword matcher
// (matchCalculatorCapability.ts).

import type { CalculatorChatServices } from '../../transport';
import { CALCULATOR_CAPABILITIES } from './capabilityRegistry';
import type { ProfitDataIntent } from '../contracts/groundedDataResult';

export type CalculatorLLMRouteResult =
  | { type: 'grounded_capability'; capability: ProfitDataIntent }
  | { type: 'clarification'; text: string }
  | { type: 'general_chat' }
  | { type: 'unavailable' };

const ALLOWED_CAPABILITY_IDS: ReadonlySet<string> = new Set(CALCULATOR_CAPABILITIES.map((c) => c.id));

export function createCalculatorCapabilityMatcher(routeCalculatorCapability: CalculatorChatServices['routeCalculatorCapability']) {
return async function matchCalculatorCapabilityLLM(
  message: string,
  recentContext: string[],
  previousCapability: string | null
): Promise<CalculatorLLMRouteResult> {
  try {
    const result = await routeCalculatorCapability(
      message,
      CALCULATOR_CAPABILITIES.map((c) => ({ id: c.id, description: c.description })),
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

    return { type: 'grounded_capability', capability: result.capability as ProfitDataIntent };
  } catch {
    return { type: 'unavailable' };
  }
}

}
