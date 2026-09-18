// Content Studio — local AI Experience candidate contract.
//
// Conforms semantically to the Gallery reference's canonical
// InsightCandidate<TFacts> (features/aiExperience/contracts/insightCandidate.ts
// in the Gallery repo: app, triggerId, priority, facts, messageTemplate,
// message, action, dedupeKey, sourceRecordId, evaluatedAt) but is this
// repo's OWN independently-typed definition — per the established Phase-2A/
// Phase-2B design pass's Option C recommendation (no shared npm package, no
// cross-repo dependency; mirrors the same approach already browser-
// validated in the To-Do, Inventory, Appointments, and E-Learning repos'
// aiExperience/contracts).
//
// Deliberately excludes every Gallery Pet-Dialogue-only field:
// `bypassEntryWalk`, `autoCloseMs`, `userState`, `dialogueId`, `source`,
// `ruleVersion`, `expiresAt` — none have meaning here.
//
// `priority` is intentionally NOT typed as Gallery's `DialoguePriority`
// ('P0'|'P1'|'PROFILE'|'P2'|'LEGACY_INTRO'|'FALLBACK') — that enum encodes
// Gallery's own global cross-app ranking. This repo owns its own
// local-only severity scale, deliberately operational-but-not-urgent:
// `MEDIUM` for a real actionable failure the user should notice; `INFO`
// for processing state and static plan information. No `CRITICAL`/`HIGH`
// tier is defined — a failed image generation is not a clinical
// emergency. The resolver's explicit precedence order (not these values)
// is what's authoritative — see resolveContentStudioInsight.ts.

/** This repo only ever produces `content-studio` candidates. */
export type InsightApp = 'content-studio';

/** Canonical trigger identity. Extend only when a new provider is actually
 *  implemented — never speculatively. Usage Limit Warning is deliberately
 *  NOT a member of this union: `public.usage_quotas` does not exist in
 *  the live Supabase project, has no write/increment path anywhere in
 *  this repo, and no generation endpoint enforces `PlanLimits` — see the
 *  Phase-2B reconciliation pass. Adding a trigger id for it here would
 *  imply the feature is one step from ready, which it is not. */
export type InsightTriggerId =
  | 'content_generation_failed'
  | 'content_generation_processing'
  | 'content_plan_entitlement';

/** Local-only severity scale — NOT Gallery's global DialoguePriority. */
export type InsightPriority = 'MEDIUM' | 'INFO';

/**
 * A real, already-existing local behavior — never a fabricated route.
 * `label` only, mirroring the Appointments/E-Learning repos' local
 * contracts: the concrete destination is wired at the call site
 * (DashboardClient.tsx), never encoded as data here.
 */
export interface InsightAction {
  label: string;
}

export interface InsightCandidate<TFacts = unknown> {
  app: InsightApp;
  triggerId: InsightTriggerId;
  priority: InsightPriority;
  /** Structured facts the deterministic rule used to decide this candidate
   *  exists — never a raw generation row, full profile object, prompt
   *  text, generated asset URL, or Supabase session. */
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
