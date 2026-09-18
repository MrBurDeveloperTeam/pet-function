// Mandatory deterministic fallback — used ONLY when a deterministic
// provider succeeded (`status: 'ok'`) but the grounded Gemini phrasing
// request itself failed. Renders the full answer directly from the same
// model-safe facts, zero LLM involvement — never falls through to
// legacy General Chat.
//
// Number formatting mirrors the existing UI convention (e.g.
// components/Dashboard.tsx: `` `${currencySymbol} ${value.toLocaleString(undefined,
// {minimumFractionDigits:2, maximumFractionDigits:2})}` `` ) rather than
// inventing a new rounding/separator rule — no authoritative shared
// formatter function exists in this repo to import instead.

import type { ProfitDataIntent } from '../contracts/groundedDataResult';
import type { CostSummaryDataFacts } from '../providers/costSummaryDataProvider';
import type { LatestSavedPlanDataFacts } from '../providers/latestSavedPlanDataProvider';

function formatAmount(value: number, currencySymbol: string): string {
  const formatted = value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currencySymbol ? `${currencySymbol} ${formatted}` : formatted;
}

function formatCostSummary(facts: CostSummaryDataFacts): string {
  return `Based on your current monthly calculator configuration, your total monthly cost is ${formatAmount(
    facts.totalMonthlyCost,
    facts.currencySymbol
  )}.`;
}

function formatLatestSavedPlan(facts: LatestSavedPlanDataFacts): string {
  const profitability = facts.isProfitable ? 'was profitable when saved' : 'was not profitable when saved';
  const procedureNote =
    facts.totalProcedures !== undefined
      ? ` and included ${facts.totalProcedures} ${facts.totalProcedures === 1 ? 'procedure' : 'procedures'}`
      : '';
  return `Your latest saved plan (${facts.timeframe}) ${profitability}${procedureNote}.`;
}

export function formatGroundedProfitFallback(intent: ProfitDataIntent, facts: unknown): string {
  switch (intent) {
    case 'profit_cost_summary':
      return formatCostSummary(facts as CostSummaryDataFacts);
    case 'profit_latest_saved_plan':
      return formatLatestSavedPlan(facts as LatestSavedPlanDataFacts);
    default:
      return "I couldn't format your answer right now.";
  }
}
