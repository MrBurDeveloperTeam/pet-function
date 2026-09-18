// Deterministic LOCAL intent router — no Gemini classification. Explicit
// phrase/pattern tables, checked in a fixed priority order (never
// arbitrary object iteration), returning a discriminated result so
// every recognized-but-unsupported financial question gets an explicit
// deterministic answer instead of silently falling through to legacy
// General Chat (which already sends `totalMonthlyCost` in its own
// `aiContext` — see App.tsx).
//
// Priority order:
//   1. what-if / hypothetical patterns — checked before the scope-
//      specific checks below, since "What if revenue increases?" must
//      be `unsupported_parameter('what_if')`, not
//      `unsupported_scope('revenue_projection')`.
//   2. scope-specific unsupported financial concepts (monthly profit,
//      revenue projection, margin, break-even, top cost driver, other
//      unsupported financial metrics) — checked BEFORE the generic
//      period-parameter check, so "What's my annual profit?" correctly
//      resolves to `unsupported_scope` (profit doesn't exist regardless
//      of period), not `unsupported_parameter('period')`.
//   3. generic period-parameter patterns (annual/yearly/next month/named
//      months/etc.) — for the one supported concept (cost), asking for a
//      non-generic-monthly period.
//   4. matched — the one v1 intent, `profit_cost_summary`.
//   5. no_match — falls through to existing predefined/legacy chat.

import type { ProfitDataIntent } from '../contracts/groundedDataResult';

export type ProfitDataRouteResult =
  | { kind: 'matched'; intent: ProfitDataIntent }
  | { kind: 'unsupported_parameter'; reason: 'what_if' | 'period' }
  | {
      kind: 'unsupported_scope';
      reason:
        | 'monthly_profit'
        | 'revenue_projection'
        | 'profit_margin'
        | 'break_even'
        | 'top_cost_driver'
        | 'unsupported_financial_metric';
    }
  | { kind: 'no_match' };

function normalize(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mentionsAny(msg: string, phrases: string[]): boolean {
  return phrases.some((p) => msg.includes(p));
}

// ── 1. What-if / hypothetical ───────────────────────────────────────────
const WHAT_IF_PATTERN = /\bwhat (if|happens if)\b/;

// ── 2. Scope-specific unsupported financial concepts ────────────────────
const MONTHLY_PROFIT_PHRASES = [
  'monthly profit',
  'my profit',
  'profit am i making',
  'profitable this month',
  'am i profitable',
  'net profit',
];
const REVENUE_PROJECTION_PHRASES = [
  'projected monthly revenue',
  'projected revenue',
  'calculated revenue',
  'revenue can the clinic generate',
  'how much revenue',
  'my revenue',
];
const PROFIT_MARGIN_PHRASES = ['profit margin', 'percentage margin', 'margin am i making'];
const BREAK_EVEN_PHRASES = ['break even', 'break-even', 'breakeven', 'how many patients do i need'];
const TOP_COST_DRIVER_PHRASES = [
  'biggest expense',
  'which cost is highest',
  'driving my costs',
  'highest cost',
  'largest expense',
];
const UNSUPPORTED_FINANCIAL_PHRASES = [
  'tax liability',
  'how much should i pay myself',
  'clinic worth',
  'my roi',
  'return on investment',
  'cash flow',
  'annual profit',
  'yearly profit',
  'how much should i charge',
  'pay myself',
];

// ── 3. Generic period parameters ────────────────────────────────────────
const PERIOD_PATTERNS = [
  /\bnext month\b/,
  /\blast month\b/,
  /\blast year\b/,
  /\bthis year\b/,
  /\bannual\b/,
  /\byearly\b/,
  /\bnext \d+ months?\b/,
  /\blast \d+ months?\b/,
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/,
];

// ── 4. Matched intent ────────────────────────────────────────────────────
const COST_SUMMARY_PHRASES = [
  'monthly cost',
  'monthly costs',
  'total monthly cost',
  'spending each month',
  'operating cost',
  'clinic configuration cost',
  'how much am i spending',
];
// Persisted snapshot on the latest SAVED plan row — not a live
// recomputation, so it doesn't carry slice 1's divergent-formula risk
// (see groundedDataResult.ts's header). Deliberately distinct from
// MONTHLY_PROFIT_PHRASES above, which stays blocked for the live/current
// "am I profitable" question this app cannot answer authoritatively.
const LATEST_SAVED_PLAN_PHRASES = [
  'latest saved plan',
  'last saved plan',
  'my last plan',
  'my latest plan',
  'was my latest plan profitable',
  'was my last plan profitable',
  'is my latest plan profitable',
  'procedures in my last plan',
  'procedures in my latest plan',
  'procedures were in my last plan',
];

export function classifyProfitDataIntent(message: string): ProfitDataRouteResult {
  const msg = normalize(message);
  if (!msg) return { kind: 'no_match' };

  if (WHAT_IF_PATTERN.test(msg)) {
    return { kind: 'unsupported_parameter', reason: 'what_if' };
  }

  if (mentionsAny(msg, MONTHLY_PROFIT_PHRASES)) {
    return { kind: 'unsupported_scope', reason: 'monthly_profit' };
  }
  if (mentionsAny(msg, REVENUE_PROJECTION_PHRASES)) {
    return { kind: 'unsupported_scope', reason: 'revenue_projection' };
  }
  if (mentionsAny(msg, PROFIT_MARGIN_PHRASES)) {
    return { kind: 'unsupported_scope', reason: 'profit_margin' };
  }
  if (mentionsAny(msg, BREAK_EVEN_PHRASES)) {
    return { kind: 'unsupported_scope', reason: 'break_even' };
  }
  if (mentionsAny(msg, TOP_COST_DRIVER_PHRASES)) {
    return { kind: 'unsupported_scope', reason: 'top_cost_driver' };
  }
  if (mentionsAny(msg, UNSUPPORTED_FINANCIAL_PHRASES)) {
    return { kind: 'unsupported_scope', reason: 'unsupported_financial_metric' };
  }

  if (PERIOD_PATTERNS.some((p) => p.test(msg))) {
    return { kind: 'unsupported_parameter', reason: 'period' };
  }

  if (mentionsAny(msg, COST_SUMMARY_PHRASES)) {
    return { kind: 'matched', intent: 'profit_cost_summary' };
  }
  if (mentionsAny(msg, LATEST_SAVED_PLAN_PHRASES)) {
    return { kind: 'matched', intent: 'profit_latest_saved_plan' };
  }

  return { kind: 'no_match' };
}
