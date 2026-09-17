/**
 * Shared timing constants used by both the Cat sprite's own entry-walk
 * animation (SharedCatMascot.tsx) and the dialogue runtime's activation
 * gate (runtime.ts) — a single source of truth instead of the duplicated
 * hardcoded "2800ms" that existed on both the presentation side and the
 * Content Studio host controller during Phase 3A (see that phase's own
 * final report, which flagged this exact duplication for Phase 3B).
 */
export const CAT_ENTRY_WALK_DURATION_MS = 2800;

/** Fallback used when a host's Welcome Back config doesn't specify (or
 *  specifies an invalid) auto-close duration — matches the pre-extraction
 *  Content Studio default exactly. */
export const DEFAULT_WELCOME_BACK_AUTO_CLOSE_MS = 6000;
