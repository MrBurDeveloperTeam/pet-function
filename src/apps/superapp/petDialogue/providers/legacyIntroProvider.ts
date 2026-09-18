import { getSuperappHostDependencies } from '../../dependencies';
import { DIALOGUE_ID, PET_DIALOGUE_RULE_VERSION } from '../types';
import type { InsightCandidate } from '../types';

/** See expiredInventoryProvider.ts's ExpiredInventoryFacts for the same
 *  design intent. `message`/`messageTemplate` intentionally only ever show
 *  the first step (`steps[0]`) — the remaining steps are carried separately
 *  via `LegacyIntroResult.steps`, exactly as before this refactor. */
export interface LegacyIntroFacts {
  configId: string;
  stepCount: number;
}

export interface LegacyIntroResult {
  candidate: InsightCandidate<LegacyIntroFacts> | null;
  steps: string[];
  /**
   * The raw `aiboard_simulator_configs.welcome_back_text` value for the
   * same authoritative config row this function already resolves for
   * Legacy Intro — reused here rather than issuing a second
   * `aiboard_simulator_configs` query for Welcome Fallback (see
   * usePersonalizedPetDialogue.ts's buildFallbackCandidate). Three states:
   * `undefined` = the config fetch itself failed/threw/found no row (the
   * caller must fall back to the hardcoded emergency text, since the field
   * is genuinely unknown); `null` = the config row exists but the column is
   * null; a string = whatever raw value is stored (may still be empty/
   * whitespace-only — the caller decides eligibility after trimming, this
   * function never judges "is this usable").
   */
  welcomeBackText: string | null | undefined;
}

/**
 * Mirrors the existing Post-Login Intro query in CatMascot's legacy
 * `initDialog()` effect (module_name='Snabbb.io', is_post_login=true for
 * logged-in users). This is an intentional, small duplication of that query
 * rather than a shared extraction: the legacy (flag-disabled) code path in
 * CatMascot must stay completely untouched by this feature, so its
 * Supabase calls are left exactly as they were. See the Phase 1A
 * implementation report for this trade-off.
 *
 * Also now the single authoritative source of `welcome_back_text` for the
 * Phase-1A Welcome Fallback candidate (see usePersonalizedPetDialogue.ts).
 * That column lives on this exact same `aiboard_simulator_configs` row, so
 * this function fetches it unconditionally — including when
 * `alreadyCompleted` is true, the one case where this function previously
 * never queried Supabase at all, and which is precisely when Welcome
 * Fallback (a returning-user message) is most likely to actually be shown.
 * The Legacy Intro candidate itself is still never built/returned once
 * `alreadyCompleted` is true — only this added `welcomeBackText` value is.
 */
export async function fetchLegacyIntroCandidate(
  userId: string,
  alreadyCompleted: boolean,
  signal?: AbortSignal
): Promise<LegacyIntroResult> {
  const { supabase } = getSuperappHostDependencies();
  if (!userId) return { candidate: null, steps: [], welcomeBackText: undefined };

  try {
    const { data: configs, error: configsError } = await supabase
      .from('aiboard_simulator_configs')
      .select('id, welcome_back_text')
      .eq('module_name', 'Snabbb.io')
      .limit(1)
      .abortSignal(signal as AbortSignal);

    if (configsError || !configs || configs.length === 0) {
      return { candidate: null, steps: [], welcomeBackText: undefined };
    }

    const configId = configs[0].id;
    const welcomeBackText: string | null = configs[0].welcome_back_text ?? null;

    if (alreadyCompleted) {
      // Legacy Intro is not eligible for a user who has already completed
      // it — unchanged from before this change — but welcome_back_text was
      // already fetched above from the same row, so it's still returned.
      return { candidate: null, steps: [], welcomeBackText };
    }

    const { data, error } = await supabase
      .from('aiboard_simulator_dialog_steps')
      .select('step_text, sort_order')
      .eq('config_id', configId)
      .eq('is_post_login', true)
      .order('sort_order', { ascending: true })
      .abortSignal(signal as AbortSignal);

    if (error) return { candidate: null, steps: [], welcomeBackText };

    const steps = (data || [])
      .map((d: { step_text: unknown }) => d.step_text)
      .filter((text: unknown): text is string => typeof text === 'string' && text.trim().length > 0);

    if (steps.length === 0) return { candidate: null, steps: [], welcomeBackText };

    const evaluatedAt = new Date().toISOString();
    const configIdStr = String(configId);
    const facts: LegacyIntroFacts = { configId: configIdStr, stepCount: steps.length };

    const candidate: InsightCandidate<LegacyIntroFacts> = {
      app: 'legacy',
      triggerId: DIALOGUE_ID.LEGACY_POST_LOGIN_INTRO,
      facts,
      // Deliberately not a `{placeholder}` template: unlike every other
      // trigger, this candidate's rendered text is fully admin-authored
      // content (`aiboard_simulator_dialog_steps.step_text`), not a
      // deterministic-rule-generated string — the canonical template form
      // here is simply the same already-approved first step.
      messageTemplate: steps[0],
      sourceRecordId: configIdStr,
      evaluatedAt,
      userState: 'LEGACY_POST_LOGIN_INTRO',
      dialogueId: DIALOGUE_ID.LEGACY_POST_LOGIN_INTRO,
      priority: 'LEGACY_INTRO',
      message: steps[0],
      source: { app: 'aiboard', recordId: configIdStr, evaluatedAt },
      dedupeKey: `legacy_intro:${userId}`,
      ruleVersion: PET_DIALOGUE_RULE_VERSION,
      recordId: configIdStr,
    };

    return { candidate, steps, welcomeBackText };
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') return { candidate: null, steps: [], welcomeBackText: undefined };
    console.warn('[petDialogue] legacy intro check failed');
    return { candidate: null, steps: [], welcomeBackText: undefined };
  }
}
