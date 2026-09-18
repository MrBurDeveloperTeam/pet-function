// Deterministic local resolver for E-Learning Phase-2B — mirrors the same
// small-module structure already browser-validated in the
// To-Do/Inventory/Appointments repos (resolveTodoInsight.ts /
// resolveInventoryInsight.ts / resolveAppointmentInsight.ts).
//
// This is intentionally NOT the Gallery global resolver (resolveDialogue.ts)
// and does not import it — Gallery's global cross-app priority is untouched
// and unrelated to this local, E-Learning-only ranking.
//
// Explicit, hardcoded precedence — never array order, never Promise
// timing:
//   1. elearning_followed_creator_posted   (current unread social activity)
//   2. elearning_latest_video_performance  (own latest eligible video, if
//                                             it has qualifying views)
//   3. elearning_most_viewed_video         (own all-time most-viewed
//                                             eligible video — a fallback
//                                             for when the latest video has
//                                             no views yet)
//   4. null
// Each candidate's own provider independently decides its own eligibility
// — this function only picks the first non-null result. There is no
// unconditional final fallback: if all three return `null`, the resolver
// returns `null` and no personalized claim is shown.
//
// Slice 1's trigger/behavior is completely unchanged by this extension —
// `evaluateFollowedCreatorPosted` is still called with the exact same
// arguments it always was, and is still checked FIRST, unconditionally.
//
// READINESS GATING LIVES HERE, NOT IN THE HOOK: `ownVideoAnalytics` is
// `undefined` when the own-video-analytics query is still loading or has
// errored (see ../hooks/useElearningPersonalizedInsight.ts) — distinct
// from `null`/a real snapshot with empty slots, which mean "ready, and
// this creator simply has no qualifying video". A lower-priority,
// still-unknown analytics state must NEVER suppress an already-resolved,
// higher-priority Followed Creator Posted candidate — so the `undefined`
// check happens AFTER the Followed Creator Posted check returns, never
// before it. Only once Followed Creator Posted is confirmed absent does an
// unknown analytics state cause this function to return `null` (rather
// than fabricating "no videos"/"0 views").

import type { FollowedCreatorPostedCandidate } from '../providers/followedCreatorPostedProvider';
import type { LatestVideoPerformanceCandidate } from '../providers/latestVideoPerformanceProvider';
import type { MostViewedVideoCandidate } from '../providers/mostViewedVideoProvider';

// A real discriminated union now that a second/third trigger exists — each
// member has its own literal-narrowed `triggerId` (see each provider's
// `*Candidate` interface), so Home.tsx can narrow on
// `candidate.triggerId === '...'` to get the right `candidate.facts` shape
// without an unsafe cast.
export type ElearningInsightCandidate =
  | FollowedCreatorPostedCandidate
  | LatestVideoPerformanceCandidate
  | MostViewedVideoCandidate;
