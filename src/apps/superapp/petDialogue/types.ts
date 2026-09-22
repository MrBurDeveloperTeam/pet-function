// Phase 1A/1C/1D/1E dialogue candidate contract.
//
// Shape follows the AI-Personalized Pet Dialogue System engineering
// reference. Priority order: incomplete profile > P0 > P1 > P2 >
// legacy post-login intro > fallback — see PRIORITY_RANK in
// resolveDialogue.ts for the authoritative numeric ranking.
//
// AI Experience Phase 1: `DialogueCandidate` below is now a direct alias of
// the canonical `InsightCandidate` contract (see
// features/aiExperience/contracts/insightCandidate.ts) rather than its own
// interface. This is a type-only, additive change — every field this file
// used to declare directly is still present, verbatim, on `InsightCandidate`
// under its "legacy-compatible fields" heading, so resolveDialogue.ts,
// usePersonalizedPetDialogue.ts, and CatMascot.tsx all keep compiling and
// behaving identically. Only the candidate-building code in
// features/petDialogue/providers/*.ts was touched, to additionally populate
// the new canonical fields (`app`, `triggerId`, `facts`, `messageTemplate`,
// `sourceRecordId`, `evaluatedAt`).

export type { InsightCandidate, InsightApp, InsightTriggerId } from '../contracts/insightCandidate';
import type { InsightCandidate } from '../contracts/insightCandidate';

export type DialoguePriority = 'P0' | 'P1' | 'PROFILE' | 'P2' | 'LEGACY_INTRO' | 'FALLBACK';

export type DialogueUserState =
  | 'ACTIVE_USER_URGENT'
  | 'NEW_USER_INCOMPLETE_PROFILE'
  | 'LEGACY_POST_LOGIN_INTRO'
  | 'GENERAL_USER_NO_URGENT';

export interface DialogueAction {
  label: string;
  route: string;
}

export interface DialogueSource {
  app: string;
  recordId?: string;
  evaluatedAt: string;
  /** Optional batch-level provenance (e.g. Phase 1B batch-authoritative expiry). Internal metadata only — never rendered in the UI. */
  batchId?: string;
}

/**
 * Backward-compatible alias: every consumer that imports `DialogueCandidate`
 * from this file continues to get the exact same field set it always did
 * (see InsightCandidate's "legacy-compatible fields") — plus the new
 * canonical fields, which every provider in ./providers now populates.
 */
export type DialogueCandidate = InsightCandidate;

/**
 * Controlled set of dialogue ids. The action-execution layer switches on
 * these (not on `action.route` as a free-form URL) so only known, reviewed
 * destinations can ever be navigated to.
 */
export const DIALOGUE_ID = {
  EXPIRED_INVENTORY: 'expired_inventory',
  OVERDUE_HIGH_TASK: 'overdue_high_task',
  APPOINTMENT_SOON: 'appointment_soon',
  INVENTORY_EXPIRING_SOON: 'inventory_expiring_soon',
  INVENTORY_LOW_STOCK: 'inventory_low_stock',
  HIGH_TASK_TODAY: 'high_task_today',
  PROFILE_INCOMPLETE: 'profile_incomplete',
  LEGACY_POST_LOGIN_INTRO: 'legacy_post_login_intro',
  WELCOME_FALLBACK: 'welcome_fallback',
} as const;

export type DialogueId = (typeof DIALOGUE_ID)[keyof typeof DIALOGUE_ID];

/** Centralized rule version for every Phase 1A candidate. */
export const PET_DIALOGUE_RULE_VERSION = 'pet-dialogue-phase-1a-v1';

/**
 * Mirrors the Odoo-derived `profileComplete` signal already resolved in
 * App.tsx. 'loading' and 'unknown' are distinct on purpose: a request that's
 * still in flight must be waited on, while a request that failed must never
 * be treated as "incomplete".
 */
export type ProfileCompletionStatus = 'loading' | 'complete' | 'incomplete' | 'unknown';

export type PersonalizedDialogueLifecycle = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * Reasons a candidate provider can fail an evaluation outright (as opposed
 * to completing and legitimately finding nothing). Distinct from `null`
 * candidates: a `null` candidate means "evaluation completed and there is
 * genuinely nothing to show"; a `failed` result means "evaluation could not
 * be trusted" and must never be read as "nothing urgent exists".
 */
export type CandidateProviderFailureReason =
  | 'item_query_failed'
  | 'batch_query_failed'
  | 'pagination_incomplete'
  | 'unexpected_data'
  | 'timeout';

/**
 * Explicit result contract for candidate providers that need to distinguish
 * a trustworthy "no candidate" outcome from an untrustworthy failure or a
 * cancelled evaluation. `aborted` covers unmount, user change, logout, and
 * superseded (stale-generation) evaluations — callers must apply no result
 * for it, not fall back to anything.
 */
export type CandidateProviderResult<T> =
  | { status: 'success'; candidate: T | null }
  | { status: 'failed'; reason: CandidateProviderFailureReason }
  | { status: 'aborted' };
