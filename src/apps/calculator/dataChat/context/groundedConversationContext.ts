// Structured grounded-conversation memory for follow-up questions (see
// SNABBB-CROSS-APP-MOLAR-AI-CONVERSATIONAL-CONTINUITY-ENHANCEMENT). Same
// design as the Todo/Inventory/Appointment reference implementations.
//
// SCOPE: only `profit_latest_saved_plan` currently has a follow-up
// handler (see resolveProfitFollowUp.ts) — "why" is answerable from that
// intent's own already-resolved facts. `profit_cost_summary` has no
// safe analytical follow-up yet: this repo has no authoritative
// category-level cost breakdown Data Chat can read (see
// groundedDataResult.ts's own header on the three divergent profit/cost
// formula implementations), so "what affected it most?" stays an honest
// no_match/limitation rather than an invented answer.

// LIFETIME: previously a closure-local `let groundedContext` inside the
// adapter created by `createProfitCalculatorMolarAdapter` (one closure
// per `useMemo` in MolarAIFloat.jsx) — destroyed every time that
// `useMemo`'s deps changed (userContext/tasks-equivalent refresh), which
// broke mid-conversation follow-ups far more often than intended.
// Host-owned (MolarAIFloat.jsx `useRef`) store instead, so the grounded
// context survives `createProfitCalculatorMolarAdapter` being rebuilt on
// ordinary data refreshes — the same architecture already proven for
// Inventory/Appointment/Todo. Only the store's own `clear()` (wired to
// explicit reset + the identity-keyed remount boundary on MolarAIFloat)
// ever drops the context, never adapter recreation.

import type { ProfitDataIntent } from '../contracts/groundedDataResult';

export interface GroundedConversationContext {
  appId: 'calculator';
  lastIntent: ProfitDataIntent;
  lastUserQuestion: string;
  generation: number;
  createdAt: string;
}

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
