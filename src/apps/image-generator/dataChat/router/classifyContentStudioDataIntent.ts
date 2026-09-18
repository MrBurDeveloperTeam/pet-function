// Deterministic LOCAL intent router — no Gemini classification. Explicit
// phrase/pattern tables, checked in a fixed priority order (never
// arbitrary object iteration), returning a discriminated result so every
// recognized-but-unsupported question gets an explicit deterministic
// answer instead of silently falling through to legacy General Chat.
//
// Priority order:
//   1. unsupported_parameter — date/period ranges, top-N/threshold
//      filters — none of the two supported intents accept any parameter.
//   2. unsupported_scope — usage/token questions (no live source),
//      generation status/failure COUNTS (Dashboard's 8-row cap makes an
//      exhaustive count unanswerable), unsupported analytics metrics.
//   3. matched — the two v1 intents.
//   4. no_match — falls through to existing predefined/legacy chat.

import type { ContentStudioDataIntent } from '../contracts/groundedDataResult';

export type ContentStudioDataRouteResult =
  | { kind: 'matched'; intent: ContentStudioDataIntent }
  | { kind: 'unsupported_parameter'; reason: 'date_range' | 'threshold' }
  | {
      kind: 'unsupported_scope';
      reason: 'usage_unavailable' | 'generation_count_unavailable' | 'unsupported_metric';
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

// ── 1. Unsupported parameters ───────────────────────────────────────────
const DATE_RANGE_PATTERNS = [
  /\bthis week\b/,
  /\bthis month\b/,
  /\blast \d+ days?\b/,
  /\blast week\b/,
  /\blast month\b/,
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/,
];
const THRESHOLD_PATTERNS = [/\btop \d+\b/, /\bmore than \d+\b/, /\ball failed\b/];

// ── 2. Unsupported scope ────────────────────────────────────────────────
const USAGE_PHRASES = [
  'how many credits',
  'how many tokens',
  'tokens do i have',
  'credits do i have',
  'images can i still generate',
  'videos can i still generate',
  'my usage',
  'remaining images',
  'remaining videos',
  'used my quota',
];
const GENERATION_COUNT_PHRASES = [
  'how many generations are processing',
  'how many failed',
  'any failed jobs',
  'how many completed',
  'how many generations do i have',
  'how many images have i generated',
  'how many videos have i generated',
  'total generations',
];
const UNSUPPORTED_METRIC_PHRASES = [
  'engagement rate',
  'social reach',
  'conversion rate',
  'revenue generated',
  'performance score',
  'best performing',
  'my roi',
  'return on investment',
];

// ── 3. Matched intents ──────────────────────────────────────────────────
const PLAN_STATUS_PHRASES = [
  'what plan am i',
  'which plan',
  'plan do i have',
  'my current plan',
  'what is my plan',
];
const RECENT_GENERATION_PHRASES = [
  'what did i generate',
  'most recent generation',
  'my latest generation',
  'latest generated content',
  'last generated content',
  'what was my last generation',
  'recently generate',
  'did my last generation',
  'my last generation fail',
];
// A LIST + status breakdown of the already-loaded recent generations
// (currently the Dashboard's own 8-row-capped query) -- deliberately
// distinct phrasing from GENERATION_COUNT_PHRASES above, which remains
// blocked for genuine ALL-TIME totals this app cannot answer. "which
// generations failed"/"processing generations" ask to see the already-
// loaded set, not to count everything that has ever existed.
const RECENT_GENERATIONS_LIST_PHRASES = [
  'recent generations',
  'recent activity',
  'generation history',
  'my generation history',
  'show my recent generations',
  'which generations failed',
  'failed generations',
  'processing generations',
  'completed generations',
  'generation status',
];

export function classifyContentStudioDataIntent(message: string): ContentStudioDataRouteResult {
  const msg = normalize(message);
  if (!msg) return { kind: 'no_match' };

  if (DATE_RANGE_PATTERNS.some((p) => p.test(msg))) {
    return { kind: 'unsupported_parameter', reason: 'date_range' };
  }
  if (THRESHOLD_PATTERNS.some((p) => p.test(msg))) {
    return { kind: 'unsupported_parameter', reason: 'threshold' };
  }

  if (mentionsAny(msg, USAGE_PHRASES)) {
    return { kind: 'unsupported_scope', reason: 'usage_unavailable' };
  }
  if (mentionsAny(msg, GENERATION_COUNT_PHRASES)) {
    return { kind: 'unsupported_scope', reason: 'generation_count_unavailable' };
  }
  if (mentionsAny(msg, UNSUPPORTED_METRIC_PHRASES)) {
    return { kind: 'unsupported_scope', reason: 'unsupported_metric' };
  }

  if (mentionsAny(msg, PLAN_STATUS_PHRASES)) return { kind: 'matched', intent: 'contentstudio_plan_status' };
  if (mentionsAny(msg, RECENT_GENERATION_PHRASES)) {
    return { kind: 'matched', intent: 'contentstudio_recent_generation' };
  }
  if (mentionsAny(msg, RECENT_GENERATIONS_LIST_PHRASES)) {
    return { kind: 'matched', intent: 'contentstudio_recent_generations_list' };
  }

  return { kind: 'no_match' };
}
