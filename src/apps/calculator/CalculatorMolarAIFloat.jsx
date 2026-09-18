"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { SharedMolarAI } from '../../ai';
import { createProfitCalculatorMolarAdapter } from './profitCalculatorMolarAdapter';
import { createGroundedContextStore } from './dataChat/context/groundedConversationContext';
import { MOLAR_LOGO_URL } from '../../resources';

const SUPPORT_MAILTO_URL = 'https://mail.google.com/mail/?view=cm&fs=1&to=support%40snabbb.com&su=Customer%20Inquiry';

/** Email Support affordance rendered inside the Molar panel via
 *  molar-experience 0.9.6's `footerContent` — same pattern already
 *  shipped for Inventory/Appointment/Todo. Plain inline SVG (no new icon
 *  package dependency, kept self-contained the same way as the others). */
export function createCalculatorMolarAIFloat({ supabase, useCalculator, useAuth, ...services }) {
function MolarSupportFooter() {
  return (
    <a
      href={SUPPORT_MAILTO_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Email support at support@snabbb.com"
      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-2.5 text-left text-slate-700 transition-all duration-200 hover:border-emerald-200 hover:bg-emerald-50/50 active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:border-emerald-800"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Email Support</span>
        <span className="block truncate text-xs opacity-70">Contact support@snabbb.com</span>
      </span>
    </a>
  );
}

// PHASE 4D NOTE (Molar AI extraction): this file is now a LOCAL adapter
// only — the floating button, chat panel, message rendering, markdown,
// input/loading/error UI, and generic send/scroll/clear lifecycle all
// live in @mrburdeveloperteam/pet-function/ai's <SharedMolarAI>. This
// component's job is: (1) build the AIAdapter Profit Calculator's own
// business logic implements (see
// ../aiExperience/profitCalculatorMolarAdapter.ts — moved mechanically,
// not rewritten), and (2) fetch the empty-state welcome
// title/subtitle/prompt-suggestions data this app has always pulled from
// AIBoard, reactively feeding it to the shared component.
//
// KNOWN, ACCEPTED TIMING SEAM (same pattern as Content Studio's Phase 3C
// migration): the empty-state AIBoard config now fetches once on mount
// rather than only when the panel is first opened, because the shared
// component's open/closed state is intentionally internal to it, not
// exposed back to hosts. This is one cheap, harmless, read-only query
// per page load — it has no effect on anything the user sees.
function MolarAIFloat({ userContext, disabled = false, onPetToggle }) {
  const { state: calculatorState, getGlobalTotalMonthlyCost, calculatorDataStatus, calculatorDataUserId, savedPlans } = useCalculator();
  const { user } = useAuth();

  const [emptyState, setEmptyState] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    const fetchSimConfig = async () => {
      try {
        const { data: configs } = await supabase
          .from('aiboard_simulator_configs')
          .select('id, title, subtitle')
          .eq('module_name', 'Profit Calculator')
          .limit(1);

        const fallbackPrompts = [
          { label: 'Review my cost structure', iconName: 'Zap' },
          { label: 'Check procedure margins', iconName: 'ShieldCheck' },
          { label: 'Find pricing risks', iconName: 'AlertCircle' },
          { label: 'Forecast clinic profit', iconName: 'BarChart3' },
        ];

        if (configs && configs.length > 0) {
          const title = configs[0].title;
          const subtitle = configs[0].subtitle || 'Ready to assist with pricing, costs, margins, forecasts, and ROI planning.';

          const { data: promptData } = await supabase
            .from('aiboard_simulator_prompts')
            .select('text, icon_name, sort_order')
            .eq('config_id', configs[0].id)
            .order('sort_order', { ascending: true });

          const prompts = promptData && promptData.length > 0
            ? promptData.map((p) => ({ label: p.text, iconName: p.icon_name }))
            : fallbackPrompts;

          if (!cancelled) setEmptyState({ title, subtitle, prompts });
        } else if (!cancelled) {
          setEmptyState({ prompts: fallbackPrompts });
        }
      } catch (err) {
        console.error('Error fetching sim configs:', err);
      }
    };

    fetchSimConfig();
    return () => { cancelled = true; };
  }, []);

  // Grounded follow-up context store — stable for this component's own
  // mount (App.tsx keys MolarAIFloat's identity boundary by the
  // authenticated Supabase user id, so a fresh store is created on
  // account switch) so it survives `adapter` below being rebuilt on
  // ordinary calculator-state refreshes.
  const groundedContextStoreRef = useRef(createGroundedContextStore());

  // General Chat cross-user context guard: `userContext` (built by
  // App.tsx's `aiContext` from CalculatorContext state) must never reach
  // General Chat unless it was computed from the CURRENT authenticated
  // user's own successfully-loaded calculator data. On a direct account
  // switch A -> B, CalculatorContext's `state`/`savedPlans` can still
  // transiently hold user A's prior values while user B's fetch is in
  // flight — `calculatorDataStatus`/`calculatorDataUserId` are the only
  // read-time signals that distinguish that from a genuinely-current
  // value (see their own doc comments in types.ts), so this checks both
  // BEFORE ever passing `userContext` through, rather than trusting that
  // an effect has already cleared stale state by the time this renders.
  const hasCurrentUserCalculatorData =
    calculatorDataStatus === 'ready' &&
    calculatorDataUserId !== null &&
    calculatorDataUserId === user?.id;

  const safeUserContext = hasCurrentUserCalculatorData ? (userContext || '') : '';

  const adapter = useMemo(
    () => createProfitCalculatorMolarAdapter({
      supabase,
      ...services,
      calculatorState,
      getGlobalTotalMonthlyCost,
      calculatorDataStatus,
      calculatorDataUserId,
      userId: user?.id ?? null,
      userContext: safeUserContext,
      savedPlans,
      groundedContextStore: groundedContextStoreRef.current,
    }),
    [calculatorState, getGlobalTotalMonthlyCost, calculatorDataStatus, calculatorDataUserId, user?.id, safeUserContext, savedPlans]
  );

  return (
    <SharedMolarAI
      adapter={adapter}
      disabled={disabled}
      onPetToggle={onPetToggle}
      emptyState={emptyState}
      logoUrl={MOLAR_LOGO_URL}
      footerContent={<MolarSupportFooter />}
    />
  );
}
return MolarAIFloat;
}
