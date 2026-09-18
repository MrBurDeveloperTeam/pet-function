export function buildUnsupportedParameterMessage(reason: 'what_if' | 'period'): string {
  if (reason === 'what_if') {
    return "I can't simulate hypothetical scenarios in data chat yet. I can check your current monthly cost configuration.";
  }
  return "I can only check your current monthly calculator configuration — not a specific past/future period. I can check your current monthly cost.";
}

export function buildUnsupportedScopeMessage(
  reason:
    | 'monthly_profit'
    | 'revenue_projection'
    | 'profit_margin'
    | 'break_even'
    | 'top_cost_driver'
    | 'unsupported_financial_metric'
): string {
  if (reason === 'monthly_profit') {
    return "I can't calculate profit in data chat yet — there's no single canonical profit figure in this calculator. I can check your current monthly cost configuration.";
  }
  if (reason === 'revenue_projection') {
    return "I don't have a calculated revenue projection to share in data chat — the revenue field is a value you enter yourself, not something the calculator projects. I can check your current monthly cost configuration.";
  }
  if (reason === 'profit_margin') {
    return "Profit margin isn't available in data chat yet — no overall margin calculation exists in this calculator. I can check your current monthly cost configuration.";
  }
  if (reason === 'break_even') {
    return "Break-even isn't available in data chat yet — no break-even calculation exists in this calculator. I can check your current monthly cost configuration.";
  }
  if (reason === 'top_cost_driver') {
    return "I can't rank your expense categories in data chat yet. I can check your current total monthly cost.";
  }
  return "That isn't something I can calculate or advise on through data chat.";
}
