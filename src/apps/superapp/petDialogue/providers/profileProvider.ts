import { getProfileSettingsRoute } from '../knownRoutes';
import { DIALOGUE_ID, PET_DIALOGUE_RULE_VERSION } from '../types';
import type { InsightCandidate, ProfileCompletionStatus } from '../types';

/** See expiredInventoryProvider.ts's ExpiredInventoryFacts for the same
 *  design intent. Minimal: this candidate has no database record beyond
 *  the user id itself. */
export interface ProfileIncompleteFacts {
  userId: string;
  status: 'incomplete';
}

/**
 * Pure — reuses the profile-completeness signal the gallery already resolves
 * via Odoo's `/partner/profile` endpoint (see App.tsx `verifySession`). Does
 * not duplicate or infer the required-field list, and never treats a
 * loading/failed lookup as "incomplete" (only an explicit `'incomplete'`
 * status produces a candidate).
 */
export function buildProfileCandidate(status: ProfileCompletionStatus, userId: string): InsightCandidate<ProfileIncompleteFacts> | null {
  if (status !== 'incomplete' || !userId) return null;

  const evaluatedAt = new Date().toISOString();
  const facts: ProfileIncompleteFacts = { userId, status: 'incomplete' };

  return {
    app: 'profile',
    triggerId: DIALOGUE_ID.PROFILE_INCOMPLETE,
    facts,
    messageTemplate: "You haven't finished your profile yet. Complete it to unlock the full Snabbb experience.",
    sourceRecordId: userId,
    evaluatedAt,
    userState: 'NEW_USER_INCOMPLETE_PROFILE',
    dialogueId: DIALOGUE_ID.PROFILE_INCOMPLETE,
    priority: 'PROFILE',
    message: "You haven't finished your profile yet. Complete it to unlock the full Snabbb experience.",
    action: { label: 'Complete Profile', route: getProfileSettingsRoute() },
    source: { app: 'profile', evaluatedAt },
    dedupeKey: `profile_incomplete:${userId}`,
    ruleVersion: PET_DIALOGUE_RULE_VERSION,
    recordId: userId,
  };
}
