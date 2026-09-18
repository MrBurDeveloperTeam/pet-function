// Deterministic LOCAL intent router — no Gemini classification. Explicit
// phrase/pattern tables, checked in a fixed priority order (never
// arbitrary object iteration), returning a discriminated result so
// every recognized-but-unsupported question gets an explicit
// deterministic answer instead of silently falling through to legacy
// General Chat.
//
// Priority order (most restrictive first):
//   1. unsupported_sensitive_scope — individual viewer-identity questions
//      ("who watched my video"). `video_views` contains a `user_id`
//      column and has a broader-than-intended pre-existing SELECT RLS
//      policy (see readiness pass §43) — Data Chat must remain stricter
//      than what the database technically allows, and must never query
//      `video_views` at all.
//   2. unsupported_parameter — view-count thresholds, "top N", date
//      ranges.
//   3. unsupported_scope — Creator Summary (deferred this slice) and
//      unsupported analytics metrics (watch time, engagement rate, etc.)
//      that aren't part of Slice 1.
//   4. matched — one of the four v1 intents (including the general
//      "list all my videos" request, backed by the same `['my-videos',
//      userId]` cache entry Studio.tsx already loads — see
//      ../providers/generalVideoListDataProvider.ts).
//   5. no_match — falls through to existing predefined/legacy chat.

import type { ElearningDataIntent } from '../contracts/groundedDataResult';

export type ElearningDataRouteResult =
  | { kind: 'matched'; intent: ElearningDataIntent }
  | { kind: 'unsupported_parameter'; reason: 'view_threshold' | 'top_n' | 'date_range' }
  | {
      kind: 'unsupported_scope';
      reason: 'creator_summary_deferred' | 'unsupported_metric';
    }
  | { kind: 'unsupported_sensitive_scope'; reason: 'viewer_identity' }
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

// ── 1. Sensitive viewer-identity scope ─────────────────────────────────
const VIEWER_IDENTITY_PATTERNS = [
  /\bwho\s+watched\b/,
  /\bwho\s+viewed\b/,
  /\bwhich\s+users?\s+(watched|viewed)\b/,
  /\bviewer\s+(names?|accounts?|identit(y|ies))\b/,
  /\bshow\s+(me\s+)?(the\s+)?viewers?\b/,
];

// ── 2. Unsupported parameters ───────────────────────────────────────────
const VIEW_THRESHOLD_PATTERN = /\b(more than|over|at least|fewer than|less than)\s+\d+\s+views?\b/;
const TOP_N_PATTERN = /\btop\s+\d+\b/;
const DATE_RANGE_PATTERNS = [
  /\bthis\s+week\b/,
  /\bthis\s+month\b/,
  /\blast\s+\d+\s+days?\b/,
  /\bposted\s+this\s+week\b/,
  /\bnext\s+\d+\s+days?\b/,
];

// ── 3. Unsupported scope ────────────────────────────────────────────────
const CREATOR_SUMMARY_PHRASES = [
  'summary of my videos',
  'how are my videos doing overall',
  'summarize my e learning content',
  'summarize my elearning content',
  'overall video summary',
  'summary of my content',
  'summarize my videos',
];
const UNSUPPORTED_METRIC_PHRASES = [
  'watch time',
  'engagement rate',
  'unique viewers',
  'unique viewer',
  'retention',
  'average watch duration',
  'watch duration',
  'how many likes',
];

// ── 4. Matched intents ──────────────────────────────────────────────────
const LATEST_PHRASES = ['latest video', 'newest video', 'most recent video'];
const MOST_VIEWED_PHRASES = ['most viewed video', 'most views', 'top video', 'most viewed'];
const FOLLOWED_UPDATES_PHRASES = [
  'creator i follow post',
  'creators i follow post',
  'from creators i follow',
  'anyone i follow post',
  'did any creator i follow',
  'new videos from creators',
  'creators i follow',
  'new from people i follow',
];
const GENERAL_VIDEO_LIST_PHRASES = [
  'show all my videos',
  'list my videos',
  'which videos have i uploaded',
  'show my videos',
  'all my videos',
  'my uploaded videos',
  'videos have i uploaded',
  'what videos do i have',
  'my video list',
];

export function classifyElearningDataIntent(message: string): ElearningDataRouteResult {
  const msg = normalize(message);
  if (!msg) return { kind: 'no_match' };

  if (VIEWER_IDENTITY_PATTERNS.some((p) => p.test(msg))) {
    return { kind: 'unsupported_sensitive_scope', reason: 'viewer_identity' };
  }

  if (VIEW_THRESHOLD_PATTERN.test(msg)) {
    return { kind: 'unsupported_parameter', reason: 'view_threshold' };
  }
  if (TOP_N_PATTERN.test(msg)) {
    return { kind: 'unsupported_parameter', reason: 'top_n' };
  }
  if (DATE_RANGE_PATTERNS.some((p) => p.test(msg))) {
    return { kind: 'unsupported_parameter', reason: 'date_range' };
  }

  if (mentionsAny(msg, CREATOR_SUMMARY_PHRASES)) {
    return { kind: 'unsupported_scope', reason: 'creator_summary_deferred' };
  }
  if (mentionsAny(msg, UNSUPPORTED_METRIC_PHRASES)) {
    return { kind: 'unsupported_scope', reason: 'unsupported_metric' };
  }

  if (mentionsAny(msg, LATEST_PHRASES)) return { kind: 'matched', intent: 'elearning_latest_video_performance' };
  if (mentionsAny(msg, MOST_VIEWED_PHRASES)) return { kind: 'matched', intent: 'elearning_most_viewed_video' };
  if (mentionsAny(msg, FOLLOWED_UPDATES_PHRASES)) {
    return { kind: 'matched', intent: 'elearning_followed_creator_updates' };
  }
  if (mentionsAny(msg, GENERAL_VIDEO_LIST_PHRASES)) {
    return { kind: 'matched', intent: 'elearning_general_video_list' };
  }

  return { kind: 'no_match' };
}


