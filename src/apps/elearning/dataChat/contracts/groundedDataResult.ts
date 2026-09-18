// E-Learning Phase-3 Data-Driven Chat contract — deliberately separate
// from ../../contracts/insightCandidate.ts (Phase-2's proactive-banner
// contract). Direct-QA semantics differ: a grounded answer is chosen by
// the user's own question, not a resolver picking one winning proactive
// candidate.
//
// `elearning_creator_summary` is NOT part of this union in Slice 1 — the
// readiness pass found no authoritative existing source proven to mean
// exactly "current user's published+public analytics-eligible video
// count" (the only candidate, `profiles.video_count`, is maintained by
// multiple competing triggers, and its "authoritative" recompute
// function filters only `status='published'`, never `visibility='public'`
// — a real mismatch with the exact eligibility Latest/Most-Viewed already
// use). Deferred until a real source is verified.

export type ElearningDataIntent =
  | 'elearning_latest_video_performance'
  | 'elearning_most_viewed_video'
  | 'elearning_followed_creator_updates'
  | 'elearning_general_video_list';

export type GroundedDataResult<TFacts> =
  | {
      status: 'ok';
      intent: ElearningDataIntent;
      /** Model-safe structured facts only — see each provider's own file
       *  header for exactly which fields are safe to send to Gemini.
       *  Never a raw video/notification/profile row. */
      facts: TFacts;
      evaluatedAt: string;
      /** Local-only ids (never sent to Gemini) — used for traceability. */
      sourceRecordIds: string[];
    }
  | {
      status: 'unavailable';
      intent: ElearningDataIntent;
      reasonCode: SourceStatus | 'evaluation_error' | 'notification_coverage_unknown';
      evaluatedAt: string;
    };

/**
 * Readiness state for one independently-loaded existing React Query
 * cache entry, derived WITHOUT ever triggering a fetch of that entry
 * (see ../hooks/useElearningDataChatSources.ts).
 *
 * - `loading`: some OTHER already-mounted consumer of this exact query
 *   key is currently fetching it.
 * - `ready`: the cache entry has real data (`dataUpdatedAt > 0`) and no
 *   error.
 * - `error`: the last fetch by any consumer of this key failed.
 * - `not_loaded`: this query key has never been populated in the cache
 *   at all during this session (e.g. the user never visited the page
 *   that mounts the source query) — genuinely unknown, NOT zero. Distinct
 *   from `loading` (nothing is currently in flight) and from `error` (no
 *   fetch was ever attempted by anything Data Chat can see).
 */
export type SourceStatus = 'loading' | 'ready' | 'error' | 'not_loaded';

/**
 * Whether the currently-loaded `notifications` array (see
 * fetchNotifications — `recipient_id = userId`, `ORDER BY created_at
 * DESC`, `LIMIT 30`) is safe to treat as the COMPLETE universe for an
 * exhaustive Followed-Creator-Updates count/zero claim.
 *
 * - `complete`: `notifications.length < 30` — the query did not hit its
 *   result cap, so every row the recipient has was returned. Only
 *   provable this way; there is no total-row-count metadata available.
 * - `potentially_truncated`: `notifications.length === 30` — the cap was
 *   hit, so older rows (which could contain an unread `new_video`
 *   notification from a still-followed creator) may exist beyond what
 *   was loaded. Fails closed: never treated as complete, never used to
 *   produce an exact count or a zero claim, regardless of how many
 *   qualifying rows are visible within the loaded 30 (evaluating what's
 *   loaded first and coincidentally being at the cap does not prove
 *   completeness — the 30th row itself could always be qualifying).
 *
 * Deliberately a SEPARATE concept from `SourceStatus` — a source can be
 * `ready` (the fetch succeeded) while its coverage is still
 * `potentially_truncated` (the result was capped, not incomplete due to
 * loading/error).
 */
export type NotificationCoverage = 'complete' | 'potentially_truncated';


