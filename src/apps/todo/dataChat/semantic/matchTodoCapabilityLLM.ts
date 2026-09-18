// LLM-based semantic capability router — the primary "genuine
// understanding" tier from the Intelligence Enhancement phase. Wraps
// geminiService.ts's `routeTodoCapability` (server-side, structured
// JSON only, never sees task data) with a SECOND, independent,
// CLIENT-SIDE validation pass before anything is allowed to execute —
// never trust a single validation layer for something that gates code
// execution, even a server-validated one.
//
// This module NEVER throws to its caller — any failure (network error,
// invalid shape, unknown capability id) resolves to `{type:'unavailable'}`
// so the adapter can fall back to the local keyword matcher
// (matchTodoCapability.ts) per the required failure order: LLM router ->
// (on failure) -> local keyword router -> General Chat/clarification.

import type { TodoChatServices } from '../../transport';
import { TODO_CAPABILITIES } from './capabilityRegistry';
import type { TodoDataIntent } from '../contracts/groundedDataResult';

export type TodoLLMRouteResult =
  | { type: 'grounded_capability'; capability: TodoDataIntent }
  | { type: 'analytical_followup'; capability: TodoDataIntent }
  | { type: 'clarification'; text: string }
  | { type: 'general_chat' }
  | { type: 'unavailable' };

const ALLOWED_CAPABILITY_IDS: ReadonlySet<string> = new Set(TODO_CAPABILITIES.map((c) => c.id));

export function createTodoCapabilityMatcher(routeTodoCapability: TodoChatServices['routeTodoCapability']) {
return async function matchTodoCapabilityLLM(
  message: string,
  recentContext: string[],
  previousCapability: string | null
): Promise<TodoLLMRouteResult> {
  try {
    const result = await routeTodoCapability(
      message,
      TODO_CAPABILITIES.map((c) => ({ id: c.id, description: c.description })),
      recentContext,
      previousCapability
    );

    if (result.route === 'general_chat') return { type: 'general_chat' };

    if (result.route === 'clarification') {
      if (typeof result.clarification !== 'string' || !result.clarification.trim()) {
        // A clarification route with no actual question is useless --
        // never guess one; treat as unavailable so the caller falls
        // back rather than showing a blank/broken prompt.
        return { type: 'unavailable' };
      }
      return { type: 'clarification', text: result.clarification };
    }

    // route === 'grounded'/'analytical_followup' -- re-validate the
    // capability id against the LOCAL registry independently of the
    // server's own check. A server response is a network payload like
    // any other; it is never trusted to gate local code execution on
    // its say-so alone.
    if (!result.capability || !ALLOWED_CAPABILITY_IDS.has(result.capability)) {
      return { type: 'unavailable' };
    }

    if (result.route === 'analytical_followup') {
      // Additionally must match the capability we told the server was
      // active -- checked again here, not just trusted from the network
      // response.
      if (result.capability !== previousCapability) {
        return { type: 'unavailable' };
      }
      return { type: 'analytical_followup', capability: result.capability as TodoDataIntent };
    }

    return { type: 'grounded_capability', capability: result.capability as TodoDataIntent };
  } catch {
    return { type: 'unavailable' };
  }
};
}

