// To-Do Manager — local AI Experience candidate contract.
//
// Conforms semantically to the Gallery reference's canonical
// InsightCandidate<TFacts> (features/aiExperience/contracts/insightCandidate.ts
// in the Gallery repo: app, triggerId, priority, facts, messageTemplate,
// message, action, dedupeKey, sourceRecordId, evaluatedAt) but is this
// repo's OWN independently-typed definition — the completed Phase-2A design
// pass recommended Option C (a locally-owned, schema-conforming contract per
// repo) over a shared npm package, since no publish/versioning
// infrastructure exists anywhere in this ecosystem and there are only two
// trigger types to define in this first slice.
//
// Deliberately excludes every Gallery Pet-Dialogue-only field:
// `bypassEntryWalk` (CatMascot entry-walk animation gate — this repo has no
// mascot entry-walk), `autoCloseMs` (Welcome Fallback auto-dismiss timer —
// this is a persistent landing banner, not a timed popup), `userState`/
// `dialogueId`/`source`/`ruleVersion`/`expiresAt`/`ndTime` (Pet Dialogue
// backward-compatibility relics with no meaning here). Only the fields this
// local UI actually needs are present.
//
// `priority` is intentionally NOT typed as Gallery's `DialoguePriority`
// ('P0'|'P1'|'PROFILE'|'P2'|'LEGACY_INTRO'|'FALLBACK') — that enum encodes
// Gallery's own GLOBAL nine-tier cross-app ranking and importing it here
// would incorrectly imply these local candidates participate in it. This
// repo owns its own local-only severity scale.

/** This repo only ever produces `todo` candidates — kept as a literal
 *  (rather than a wider union) so a future slice adding another app-scoped
 *  concept can't silently misuse this field. */
export type InsightApp = 'todo';

/** Canonical trigger identity. Extend only when a new provider is actually
 *  implemented — never speculatively. `todo_normal_tasks_today` and
 *  `todo_nothing_today` were added in the second Phase-2A slice. */
export type InsightTriggerId =
  | 'todo_overdue_high'
  | 'todo_high_today'
  | 'todo_normal_tasks_today'
  | 'todo_nothing_today';

/** Local-only severity scale for To-Do's own resolver — NOT Gallery's
 *  global DialoguePriority. `LOW` (Normal Tasks Today: informational, still
 *  task-related) and `INFO` (Nothing Today: neutral positive fallback, not
 *  an alert) were added in the second Phase-2A slice. */
export type InsightPriority = 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

/**
 * A real, already-existing local navigation target — never a fabricated
 * URL route. `'today'` is one of this repo's own `ViewType` values (see
 * src/types.ts), applied via Home.tsx's existing `setCurrentView`.
 * `'overdue'` is not a `ViewType` — it's the existing `currentFilter`
 * value TodoView.tsx already recognizes (see its `standardFilters`/filter
 * sidebar) — Home.tsx's action handler special-cases it to
 * `setCurrentView('todo')` + `setCurrentFilter('overdue')`, the same two
 * calls the existing sidebar filter click already makes.
 */
export interface InsightAction {
  label: string;
  view: 'today' | 'overdue';
}

export interface InsightCandidate<TFacts = unknown> {
  app: InsightApp;
  triggerId: InsightTriggerId;
  priority: InsightPriority;
  /** Structured facts the deterministic rule used to decide this candidate
   *  exists — never a raw task object, Supabase session, or JWT. */
  facts: TFacts;
  /** Canonical template form (with `{placeholder}` tokens) — distinct from
   *  `message`, the already-rendered string. No AI ever touches either. */
  messageTemplate: string;
  message: string;
  action?: InsightAction;
  dedupeKey: string;
  /** `null` for a future aggregate candidate with no single backing record
   *  (e.g. a later "Normal Tasks Today" count) — matches the Gallery
   *  canonical contract's nullable semantics. Both candidates in this first
   *  slice always have a real task id. */
  sourceRecordId: string | null;
  evaluatedAt: string;
}
