// Snabbb AI Experience — Phase 1 canonical candidate contract.
//
// This is the ONE deterministic candidate/fact shape intended to eventually
// feed three surfaces without duplicating business logic:
//   1. Cat Dialogue (the only active consumer today — see features/petDialogue)
//   2. Mini-App Landing Insight (not implemented in Phase 1)
//   3. Data-Driven Chat grounding context (not implemented in Phase 1)
//
// The one architectural requirement Phase 1 exists to satisfy: FACTS
// (structured, machine-readable) must be separate from the RENDERED MESSAGE
// (the exact string already shown to the user). `facts` + `messageTemplate`
// are the new, additive fields that make that separation real; `message`
// remains the byte-for-byte identical rendered string every provider already
// produced before this refactor.
//
// Design choice — additive, not a rewrite: every field the pre-Phase-1
// `DialogueCandidate` type had (userState, dialogueId, priority, message,
// action, source, dedupeKey, ruleVersion, bypassEntryWalk, autoCloseMs,
// eventTime, createdTime, recordId) is preserved verbatim below under a
// "legacy-compatible" heading. `features/petDialogue/types.ts`'s
// `DialogueCandidate` is now a direct alias of `InsightCandidate` — every
// existing consumer (resolveDialogue.ts, usePersonalizedPetDialogue.ts,
// CatMascot.tsx) keeps compiling and behaving identically without any
// changes on their end. Only the providers that BUILD candidates were
// touched, to additionally populate the new canonical fields.
//
// Two fields are intentionally duplicated with their legacy equivalent
// rather than replacing them, exactly per the allowance for temporary
// backward-compatible duplication:
//   - `sourceRecordId` (canonical) mirrors `recordId`/`source.recordId`
//     (legacy) — the legacy fields stay because resolveDialogue.ts's
//     tie-break reads `recordId` directly and must not be touched.
//   - `evaluatedAt` (canonical, top-level) mirrors `source.evaluatedAt`
//     (legacy) — both are set from the same single `new Date().toISOString()`
//     call per candidate build, so they can never drift apart.
// `app` (canonical) is also deliberately distinct from `source.app` (legacy)
// for two candidates where the underlying data-source label and the
// mini-app category differ on purpose — see InsightApp below.

import type {
  DialogueAction,
  DialogueId,
  DialoguePriority,
  DialogueSource,
  DialogueUserState,
} from '../petDialogue/types';

/**
 * Canonical mini-app / surface category a candidate conceptually belongs
 * to — this is what a future Mini-App Landing Insight surface would key
 * off of, not the literal Supabase/service origin (`source.app`, unchanged
 * legacy field). `legacy` and `system` are deliberate: the Post-Login Intro
 * and Welcome Fallback candidates don't belong to any one mini-app, and
 * forcing them into `inventory`/`todo`/`appointments`/`profile` would be
 * inaccurate — see legacyIntroProvider.ts (`source.app: 'aiboard'`) and the
 * fallback builder (`source.app: 'gallery'`), both preserved unchanged.
 */
export type InsightApp = 'inventory' | 'todo' | 'appointments' | 'profile' | 'legacy' | 'system';

/**
 * Canonical trigger identity. Reuses the existing petDialogue `DialogueId`
 * string values verbatim (`expired_inventory`, `overdue_high_task`, ...) —
 * Phase 1 introduces no new or duplicate trigger identities; `triggerId`
 * and the legacy `dialogueId` field always hold the exact same string for
 * any given candidate.
 */
export type InsightTriggerId = DialogueId;

/**
 * The canonical Phase 1 candidate contract. Generic over `TFacts` so each
 * provider can declare its own structured fact shape (see
 * features/petDialogue/providers/*.ts) while every consumer that only needs
 * the legacy-compatible fields (ranking, dedupe, rendering) can keep
 * treating this as `InsightCandidate` with an unconstrained `facts` object —
 * exactly what `DialogueCandidate` in petDialogue/types.ts now is.
 */
export interface InsightCandidate<TFacts = unknown> {
  // ---- Canonical Phase 1 fields ----------------------------------------
  /** Mini-app / surface category — see InsightApp. */
  app: InsightApp;
  /** Canonical trigger identity — always equal to `dialogueId` below. */
  triggerId: InsightTriggerId;
  /** Structured facts the deterministic rule actually used to decide this
   *  candidate exists — the one thing a future grounded-chat/landing-insight
   *  surface can read without re-querying or reverse-parsing `message`. */
  facts: TFacts;
  /** Deterministic, approved canonical template (with `{placeholder}`
   *  tokens where the rendered message varies) — distinct from `message`,
   *  the already-rendered string. No AI ever rewrites either field in
   *  Phase 1. */
  messageTemplate: string;
  /** Canonical mirror of `recordId`/`source.recordId` — `null` when a
   *  candidate has no real database record (none currently do, but the
   *  contract must not force a fabricated id if a future provider has
   *  none). */
  sourceRecordId: string | null;
  /** Canonical mirror of `source.evaluatedAt`, from the same timestamp. */
  evaluatedAt: string;

  // ---- Legacy-compatible fields (unchanged; every existing consumer
  // reads these exactly as before Phase 1) -------------------------------
  userState: DialogueUserState;
  dialogueId: InsightTriggerId;
  priority: DialoguePriority;
  message: string;
  action?: DialogueAction;
  source: DialogueSource;
  expiresAt?: string;
  dedupeKey: string;
  ruleVersion: string;
  /** P0 alerts may bypass the cosmetic entry-walk gate; everything else waits for it. */
  bypassEntryWalk?: boolean;
  /** Only the fixed welcome fallback uses this today. */
  autoCloseMs?: number;
  /** Event/condition time (e.g. an expiry date) — first tie-breaker within the same priority. */
  eventTime?: string;
  /** Record creation time — second tie-breaker within the same priority. */
  createdTime?: string;
  /** Stable record id — final tie-breaker. Callers fall back to dedupeKey when no natural id exists. */
  recordId?: string;
}
