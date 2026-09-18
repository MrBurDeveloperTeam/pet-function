// Capability registry — what Molar AI can actually answer in Calculator,
// independent of any specific phrasing. Only the 2 intents this app
// actually supports — see groundedDataResult.ts's own header for why
// live profit/margin/break-even/cost-driver remain intentionally
// unsupported (3 divergent formula implementations, a genuine
// correctness risk) and are NOT capabilities here at all, semantic or
// otherwise.

import type { ProfitDataIntent } from '../contracts/groundedDataResult';

export interface CalculatorCapability {
  id: ProfitDataIntent;
  description: string;
  keywords: string[];
}

export const CALCULATOR_CAPABILITIES: CalculatorCapability[] = [
  {
    id: 'profit_cost_summary',
    description: "The current live monthly cost configuration's total.",
    keywords: ['cost situation', 'spending', 'current costs', 'cost configuration', 'expenses each month'],
  },
  {
    id: 'profit_latest_saved_plan',
    description: 'Whether the most recently saved plan was profitable when saved.',
    keywords: ['saved plan', 'last plan', 'latest plan', 'how is my plan', 'plan profitable', 'plan summary'],
  },
];
