// E-Learning — local AI Experience candidate contract.
//
// Conforms semantically to the Gallery reference's canonical
// InsightCandidate<TFacts> (features/aiExperience/contracts/insightCandidate.ts
// in the Gallery repo: app, triggerId, priority, facts, messageTemplate,
// message, action, dedupeKey, sourceRecordId, evaluatedAt) but is this
// repo's OWN independently-typed definition — per the established Phase-2A/
// Phase-2B design pass's Option C recommendation (no shared npm package, no
// cross-repo dependency; mirrors the same approach already browser-
// validated in the To-Do, Inventory, and Appointments repos' aiExperience/
// contracts).
//
// Deliberately excludes every Gallery Pet-Dialogue-only field:
// `bypassEntryWalk`, `autoCloseMs`, `userState`, `dialogueId`, `source`,
// `ruleVersion`, `expiresAt` — none have meaning here. Only the fields this
// local UI actually needs are present.
//
// `priority` is intentionally NOT typed as Gallery's `DialoguePriority`
// ('P0'|'P1'|'PROFILE'|'P2'|'LEGACY_INTRO'|'FALLBACK') — that enum encodes
// Gallery's own global cross-app ranking and importing it here would
// incorrectly imply this local candidate participates in it. This repo
// owns its own local-only severity scale, deliberately social/informational
// rather than clinical/operational: `MEDIUM` for a real, actionable social
// nudge (a followed creator posted); `INFO` for the Slice-2 own-video
// analytics candidates (Latest Video Performance, Most Viewed Video) —
// positive, non-urgent creator stats, not alerts. No `CRITICAL`/`HIGH` tier
// is defined — nothing in this app's social-feed domain is an emergency the
// way Appointments' "starts in under 2 hours" is. The resolver's explicit
// precedence order (not these values) is what's authoritative — see
// resolveElearningInsight.ts.

/** This repo only ever produces `elearning` candidates. */
export type InsightApp = 'elearning';

/** Canonical trigger identity. Extend only when a new provider is actually
 *  implemented — never speculatively. `elearning_followed_creator_posted`
 *  is Slice 1's trigger; `elearning_latest_video_performance` and
 *  `elearning_most_viewed_video` are Slice 2's two own-video analytics
 *  triggers, added additively without touching Slice 1's trigger id. */
export type InsightTriggerId =
  | 'elearning_followed_creator_posted'
  | 'elearning_latest_video_performance'
  | 'elearning_most_viewed_video';

/** Local-only severity scale — NOT Gallery's global DialoguePriority. */
export type InsightPriority = 'MEDIUM' | 'INFO';

/**
 * A real, already-existing local behavior — never a fabricated route.
 * `label` only, mirroring the Appointments repo's local contract: this
 * repo's action always resolves to the real `/watch/$videoId` route (the
 * same one Notifications.tsx and NotificationBell.tsx already navigate to)
 * plus the existing `markNotificationRead` mutation, wired at the call
 * site rather than encoded as data here.
 */
export interface InsightAction {
  label: string;
}

export interface InsightCandidate<TFacts = unknown> {
  app: InsightApp;
  triggerId: InsightTriggerId;
  priority: InsightPriority;
  /** Structured facts the deterministic rule used to decide this candidate
   *  exists — never a raw notification row, full profile object, video
   *  content, or Supabase session. */
  facts: TFacts;
  /** Canonical template form (with `{placeholder}` tokens) — distinct from
   *  `message`, the already-rendered string. No AI ever touches either. */
  messageTemplate: string;
  message: string;
  action?: InsightAction;
  dedupeKey: string;
  sourceRecordId: string | null;
  evaluatedAt: string;
}
