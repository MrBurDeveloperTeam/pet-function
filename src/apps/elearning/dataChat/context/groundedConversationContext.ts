// Structured grounded-conversation memory for follow-up questions (see
// SNABBB-CROSS-APP-MOLAR-AI-CONVERSATIONAL-CONTINUITY-ENHANCEMENT). Same
// design as the Todo/Inventory/Appointment/Calculator reference
// implementations: structured, not inferred from rendered text; lives
// only inside the adapter closure (one per authenticated user); explicit
// reset wired via the shared package's `AIAdapter.reset()` hook.

import type { ElearningDataIntent } from '../contracts/groundedDataResult';

export interface GroundedConversationContext {
  appId: 'elearning';
  lastIntent: ElearningDataIntent;
  presentedOrder: 'display' | 'ranked';
  lastUserQuestion: string;
  generation: number;
  createdAt: string;
}


