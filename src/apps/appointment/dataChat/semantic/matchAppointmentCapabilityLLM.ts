// LLM-based semantic capability router — see Todo's
// matchTodoCapabilityLLM.ts for the full architecture rationale. Scoped
// to ONLY the 4 non-PII capabilities in capabilityRegistry.ts — the same
// deliberate exclusion as matchAppointmentCapability.ts's local matcher,
// so this is never even given the option of naming a patient-identity
// intent. Never throws to its caller; any failure resolves to
// `{type:'unavailable'}` so the adapter falls back to the local keyword
// matcher.

import type { AppointmentChatServices } from '../../transport';
import { APPOINTMENT_CAPABILITIES } from './capabilityRegistry';
import type { AppointmentCapability } from './capabilityRegistry';

export type AppointmentLLMRouteResult =
  | { type: 'grounded_capability'; capability: AppointmentCapability['id'] }
  | { type: 'clarification'; text: string }
  | { type: 'general_chat' }
  | { type: 'unavailable' };

const ALLOWED_CAPABILITY_IDS: ReadonlySet<string> = new Set(APPOINTMENT_CAPABILITIES.map((c) => c.id));

export function createAppointmentCapabilityMatcher(routeAppointmentCapability: AppointmentChatServices['routeAppointmentCapability']) {
return async function matchAppointmentCapabilityLLM(
  message: string,
  recentContext: string[],
  previousCapability: string | null
): Promise<AppointmentLLMRouteResult> {
  try {
    const result = await routeAppointmentCapability(
      message,
      APPOINTMENT_CAPABILITIES.map((c) => ({ id: c.id, description: c.description })),
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

    return { type: 'grounded_capability', capability: result.capability as AppointmentCapability['id'] };
  } catch {
    return { type: 'unavailable' };
  }
}

}
