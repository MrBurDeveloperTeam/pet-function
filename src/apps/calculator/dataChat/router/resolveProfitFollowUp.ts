// Grounded conversational follow-up resolver — Tier C. Tried ONLY when
// classifyProfitDataIntent(msg) returned `no_match` AND the active
// context's `lastIntent === 'profit_latest_saved_plan'`. Re-resolves the
// same intent against the CURRENT live `savedPlans` array (never a
// cached snapshot) and explains the "why" behind the prior answer from
// the exact same facts — no new Gemini call, no invented figures.

import { resolveProfitDataQuery } from '../resolver/resolveProfitDataQuery';
import type { GroundedConversationContext } from '../context/groundedConversationContext';
import type { CalculatorDataStatus, CalculatorDataOwnerId } from '../contracts/groundedDataResult';
import type { GlobalState, SavedPlan } from '../../types';

interface LatestSavedPlanFacts {
  planId: string;
  timeframe: SavedPlan['timeframe'];
  isProfitable: boolean;
  totalProcedures?: number;
}

const WHY_PHRASES = ['why', 'why is that', 'why was it', 'explain that', 'explain more simply'];

function normalize(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveProfitFollowUp(
  message: string,
  context: GroundedConversationContext | null,
  state: GlobalState,
  getGlobalTotalMonthlyCost: () => number,
  calculatorDataStatus: CalculatorDataStatus,
  calculatorDataUserId: CalculatorDataOwnerId,
  currentAuthenticatedUserId: string | null,
  savedPlans: SavedPlan[]
): string | null {
  if (!context || context.lastIntent !== 'profit_latest_saved_plan') return null;

  const msg = normalize(message);
  if (!msg) return null;
  if (!(WHY_PHRASES.includes(msg) || msg.startsWith('why '))) return null;

  const result = resolveProfitDataQuery(
    context.lastIntent,
    state,
    getGlobalTotalMonthlyCost,
    calculatorDataStatus,
    calculatorDataUserId,
    currentAuthenticatedUserId,
    savedPlans
  );
  if (result.status !== 'ok') return null;

  const facts = result.facts as LatestSavedPlanFacts;
  if (facts.isProfitable) {
    const procedureNote =
      facts.totalProcedures !== undefined
        ? ` with ${facts.totalProcedures} ${facts.totalProcedures === 1 ? 'procedure' : 'procedures'} included`
        : '';
    return `It was profitable when saved${procedureNote} — the plan's persisted results showed revenue covering its costs for that ${facts.timeframe} configuration.`;
  }
  const procedureNote =
    facts.totalProcedures !== undefined
      ? ` with ${facts.totalProcedures} ${facts.totalProcedures === 1 ? 'procedure' : 'procedures'} included`
      : '';
  return `It wasn't profitable when saved${procedureNote} — the plan's persisted results showed costs exceeding revenue for that ${facts.timeframe} configuration. I don't have a category-level cost breakdown for that saved plan to say exactly which cost drove it.`;
}
