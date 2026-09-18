// Structured grounded-conversation memory for follow-up questions (see
// SNABBB-CROSS-APP-MOLAR-AI-CONVERSATIONAL-CONTINUITY-ENHANCEMENT). Same
// design as the other 5 apps' reference implementations: structured, not
// inferred from rendered text; lives only inside the adapter closure
// (one per authenticated user); explicit reset wired via the shared
// package's `AIAdapter.reset()` hook.

import type { ContentStudioDataIntent } from '../contracts/groundedDataResult';

export interface GroundedConversationContext {
  appId: 'content-studio';
  lastIntent: ContentStudioDataIntent;
  lastUserQuestion: string;
  generation: number;
  createdAt: string;
}
