// Structured grounded-conversation memory for follow-up questions (see
// SNABBB-CROSS-APP-MOLAR-AI-CONVERSATIONAL-CONTINUITY-ENHANCEMENT). Same
// design as the Todo/Inventory reference implementations: structured,
// not inferred from rendered text; lives only inside the adapter closure
// (one per authenticated clinic session); explicit reset wired via the
// shared package's `AIAdapter.reset()` hook.
//
// SCOPE: only `appointment_today_list`/`appointment_next_appointment`
// ever populate this — the two intents whose facts resolve real patient
// identity and therefore NEVER reach Gemini (see
// todayScheduleDataProvider.ts's/nextAppointmentDataProvider.ts's own
// "NOT MODEL-SAFE FACTS" headers). Follow-up answers built from this
// context (see resolveAppointmentFollowUp.ts) are therefore ALSO always
// rendered by the same local deterministic formatter, NEVER by a Gemini
// call — preserving the zero-patient-PII-to-Gemini boundary exactly, not
// just for the original question but for every follow-up on it too.

import type { AppointmentDataIntent } from '../contracts/groundedDataResult';

export interface GroundedConversationContext {
  appId: 'appointment';
  lastIntent: Extract<AppointmentDataIntent, 'appointment_today_list' | 'appointment_next_appointment'>;
  /** Only meaningful when `lastIntent === 'appointment_next_appointment'`
   *  — re-passed to `resolveAppointmentDataQuery` on every follow-up so
   *  re-resolution matches the original question's scope exactly. */
  todayOnly: boolean;
  lastUserQuestion: string;
  generation: number;
  createdAt: string;
}

// Host-owned (MolarAIFloat.jsx `useRef`) small store so the grounded
// context survives `createAppointmentsMolarAdapter` being rebuilt when its
// deps (appointments/rooms/appointmentDataStatus/loadedAppointmentRange/
// patients/staff/treatments/userContext) change on an ordinary rerender —
// only the store's own `clear()` (wired to explicit reset + the
// identity-keyed remount boundary on MolarAIFloat, see App.jsx) ever
// drops the context, never adapter recreation.
export interface GroundedContextStore {
  get(): GroundedConversationContext | null;
  set(ctx: GroundedConversationContext | null): void;
  clear(): void;
}

export function createGroundedContextStore(): GroundedContextStore {
  let current: GroundedConversationContext | null = null;
  return {
    get: () => current,
    set: (ctx) => { current = ctx; },
    clear: () => { current = null; },
  };
}
