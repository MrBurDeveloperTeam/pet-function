"use client";
import { createTodoSNAIService } from './snaiService';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SharedMolarAI } from '../../ai';
import { createTodoMolarAdapter } from './todoMolarAdapter';
import { createGroundedContextStore } from './dataChat/context/groundedConversationContext';
import { MOLAR_LOGO_URL } from '../../resources';


/** Email Support affordance rendered inside the Molar panel via
 *  molar-experience 0.9.6's `footerContent` — same pattern already
 *  shipped for Inventory/Appointment. Plain inline SVG (no new icon
 *  package dependency, even though `lucide-react` IS a direct dependency
 *  here — kept self-contained the same way as the other apps). */
export function createTodoMolarAIFloat({ supabase, ...services }) {
  services = { ...createTodoSNAIService(supabase), ...services };

// PHASE 5C NOTE (Molar AI extraction): this file is now a LOCAL adapter
// only — the floating button, chat panel, message rendering, markdown,
// input/loading/error UI, and generic send/scroll/clear lifecycle all
// live in @mrburdeveloperteam/pet-function/ai's <SharedMolarAI>. This
// component's job is: (1) build the AIAdapter To-Do's own business logic
// implements (see ../aiExperience/todoMolarAdapter.ts — moved
// mechanically, not rewritten), and (2) fetch the empty-state welcome
// title/subtitle/prompt-suggestions data this app has always pulled from
// AIBoard, reactively feeding it to the shared component.
//
// KNOWN, ACCEPTED TIMING SEAM (same pattern as Profit Calculator's Phase
// 4D migration): the empty-state AIBoard config now fetches once on
// mount rather than only when the panel is first opened, because the
// shared component's open/closed state is intentionally internal to it,
// not exposed back to hosts. This is one cheap, harmless, read-only
// query per page load — it has no effect on anything the user sees.
function TodoMolarAIFloat({ userContext, disabled = false, onPetToggle, tasks = [], taskDataStatus = 'loading' }) {
  const [emptyState, setEmptyState] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    const fetchSimConfig = async () => {
      try {
        const { data: configs } = await supabase
          .from('aiboard_simulator_configs')
          .select('id, title, subtitle')
          .eq('module_name', 'To-Do Manager')
          .limit(1);

        const fallbackPrompts = [
          { label: 'How does it work?', iconName: 'Zap' },
          { label: 'Show examples', iconName: 'ShieldCheck' },
          { label: 'Best practices', iconName: 'AlertCircle' },
          { label: 'Get help', iconName: 'BarChart3' },
        ];

        if (configs && configs.length > 0) {
          const title = configs[0].title;
          const subtitle = configs[0].subtitle || 'Ready to assist with tasks, reminders, calendar planning, and productivity workflows.';

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
  // mount (App.tsx keys MolarAIFloat's identity boundary by
  // session.user.id, so a fresh store is created on account switch) so it
  // survives `adapter` below being rebuilt on ordinary tasks/
  // taskDataStatus refreshes.
  const groundedContextStoreRef = useRef(createGroundedContextStore());

  const adapter = useMemo(
    () => createTodoMolarAdapter({
      tasks,
      taskDataStatus,
      userContext: userContext || '',
      groundedContextStore: groundedContextStoreRef.current,
      supabase,
      ...services,
    }),
    [tasks, taskDataStatus, userContext]
  );

  return (
    <SharedMolarAI
      adapter={adapter}
      disabled={disabled}
      onPetToggle={onPetToggle}
      emptyState={emptyState}
      logoUrl={MOLAR_LOGO_URL}
    />
  );
}
return TodoMolarAIFloat;
}
