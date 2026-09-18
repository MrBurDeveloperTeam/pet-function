// Profit Calculator — local AI Experience candidate contract.
//
// Conforms semantically to the Gallery reference's canonical
// InsightCandidate<TFacts> (features/aiExperience/contracts/insightCandidate.ts
// in the Gallery repo: app, triggerId, priority, facts, messageTemplate,
// message, action, dedupeKey, sourceRecordId, evaluatedAt) but is this
// repo's OWN independently-typed definition — per the established Phase-2A/
// Phase-2B design pass's Option C recommendation (no shared npm package, no
// cross-repo dependency; mirrors the same approach already browser-
// validated in the To-Do, Inventory, Appointments, E-Learning, and Content
// Studio repos' aiExperience/contracts).
//
// Deliberately excludes every Gallery Pet-Dialogue-only field:
// `bypassEntryWalk`, `autoCloseMs`, `userState`, `dialogueId`, `source`,
// `ruleVersion`, `expiresAt` — none have meaning here.
//
// `priority` is intentionally NOT typed as Gallery's `DialoguePriority`.
// This repo owns its own local-only severity scale: `MEDIUM` for a real,
// noteworthy negative outcome on a saved plan; `INFO` for a positive/
// informational summary. No `CRITICAL` tier — a saved plan projection
// being unprofitable is not a clinical/business emergency, and it is
// explicitly NOT a claim about the clinic's actual current finances (see
// the providers' own file headers).

/** This repo only ever produces `profit-calculator` candidates. */
export type InsightApp = 'profit-calculator';

/** Canonical trigger identity. Extend only when a new provider is actually
 *  implemented — never speculatively. Revenue/Net Profit monetary
 *  summary, cost warnings (staff/consumables/sterilization/etc.), and any
 *  "No Saved Plans" trigger are deliberately NOT members of this union —
 *  see the Phase-2B readiness pass: currency is not snapshotted per plan,
 *  cost configuration is global-not-historical, and the current
 *  `savedPlans` state cannot distinguish loading/error/genuinely-empty. */
export type InsightTriggerId =
  | 'profit_latest_saved_plan_not_profitable'
  | 'profit_latest_saved_plan_summary';

/** Local-only severity scale — NOT Gallery's global DialoguePriority. */
export type InsightPriority = 'MEDIUM' | 'INFO';

/**
 * A real, already-existing local behavior — never a fabricated route.
 * `label` only; the concrete behavior (`openModal(plan.type, plan)`,
 * resolved from `planId` against current `savedPlans` at the UI
 * boundary) is wired at the call site (Dashboard.tsx), never encoded as
 * data here — see this slice's Action Boundary notes in
 * ../providers/*.ts.
 */
export interface InsightAction {
  label: string;
}

export interface InsightCandidate<TFacts = unknown> {
  app: InsightApp;
  triggerId: InsightTriggerId;
  priority: InsightPriority;
  /** Structured facts the deterministic rule used to decide this candidate
   *  exists — never a raw SavedPlan row, plan name, monetary value,
   *  procedure-quantity map, or global cost configuration. */
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
