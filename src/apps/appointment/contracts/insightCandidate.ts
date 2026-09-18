// Appointments — local AI Experience candidate contract.
//
// Conforms semantically to the Gallery reference's canonical
// InsightCandidate<TFacts> (features/aiExperience/contracts/insightCandidate.ts
// in the Gallery repo: app, triggerId, priority, facts, messageTemplate,
// message, action, dedupeKey, sourceRecordId, evaluatedAt) but is this
// repo's OWN independently-typed definition — per the established Phase-2A
// design pass's Option C recommendation (no shared npm package, no
// cross-repo dependency; mirrors the same approach already browser-
// validated in the To-Do and Inventory repos' aiExperience/contracts).
//
// Deliberately excludes every Gallery Pet-Dialogue-only field:
// `bypassEntryWalk` (CatMascot entry-walk animation gate — this repo has no
// mascot entry-walk), `autoCloseMs` (Welcome Fallback auto-dismiss timer —
// this is a persistent landing banner, not a timed popup), `userState`/
// `dialogueId`/`source`/`ruleVersion`/`expiresAt` (Pet Dialogue backward-
// compatibility relics with no meaning here). Only the fields this local UI
// actually needs are present.
//
// `priority` is intentionally NOT typed as Gallery's `DialoguePriority`
// ('P0'|'P1'|'PROFILE'|'P2'|'LEGACY_INTRO'|'FALLBACK') — that enum encodes
// Gallery's own GLOBAL nine-tier cross-app ranking and importing it here
// would incorrectly imply this local candidate participates in it. This
// repo owns its own local-only severity scale.

/** This repo only ever produces `appointments` candidates. */
export type InsightApp = 'appointments';

/** Canonical trigger identity. Extend only when a new provider is actually
 *  implemented — never speculatively. Reuses the Gallery reference's
 *  existing `appointment_soon` trigger identity for the same condition.
 *  `appointment_daily_summary` / `appointment_none_today` are this
 *  slice's two new aggregate candidates — "today count" and "room in
 *  use" are internal facts composing `appointment_daily_summary`, never
 *  separate public trigger ids of their own (there is still only ever
 *  one selected local insight at a time). */
export type InsightTriggerId = 'appointment_soon' | 'appointment_daily_summary' | 'appointment_none_today';

/** Local-only severity scale for Appointments' own resolver — NOT Gallery's
 *  global DialoguePriority. `HIGH` is Appointment Soon's real, meaningful
 *  upcoming-operational-alert tier; `MEDIUM` is Daily Summary's
 *  operational-status tier; `INFO` is No Appointments Today's purely
 *  informational tier. The resolver's explicit precedence order (not
 *  these values) is what's authoritative — see resolveAppointmentInsight.ts. */
export type InsightPriority = 'HIGH' | 'MEDIUM' | 'INFO';

/**
 * A real, already-existing local behavior — never a fabricated URL route.
 * Deliberately just a `label`, not a `view` value: this insight only ever
 * renders while `view === 'calendar'` (see App.jsx), so a "switch to the
 * calendar view" action would be a no-op the user is already on. The real
 * reusable behavior this action triggers is CalendarView.jsx's own
 * existing "Today" button (`setCurrentDate(new Date())`) — App.jsx's
 * `onAction` handler for this candidate calls that exact same setter.
 */
export interface InsightAction {
  label: string;
}

export interface InsightCandidate<TFacts = unknown> {
  app: InsightApp;
  triggerId: InsightTriggerId;
  priority: InsightPriority;
  /** Structured facts the deterministic rule used to decide this candidate
   *  exists — never a raw appointment record, patient data, Supabase
   *  session, or JWT. */
  facts: TFacts;
  /** Canonical template form (with `{placeholder}` tokens) — distinct from
   *  `message`, the already-rendered string. No AI ever touches either. */
  messageTemplate: string;
  message: string;
  action?: InsightAction;
  dedupeKey: string;
  /** `null` for a future aggregate candidate with no single backing record
   *  (e.g. a later Daily Summary) — matches the Gallery canonical
   *  contract's nullable semantics. This first slice's candidate always
   *  has a real appointment id. */
  sourceRecordId: string | null;
  evaluatedAt: string;
}
