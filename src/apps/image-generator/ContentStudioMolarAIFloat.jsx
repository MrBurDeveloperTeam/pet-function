"use client";
import { createContentStudioSNAIService } from './snaiService';
import { useEffect, useMemo, useState } from 'react';
import { SharedMolarAI } from '../../ai';
import { useContentStudioDataChatContext } from './ContentStudioDataChatProvider';
import { createContentStudioAIAdapter } from './contentStudioMolarAdapter';
import { MOLAR_LOGO_URL } from '../../resources';

// Carried over from the pre-migration local MolarChat.jsx panel, which
// rendered this exact card inside its own chat window (removed along
// with the rest of that file's now-shared-package-owned UI). Restored
// via molar-experience 0.9.5's SharedMolarAIProps.footerContent, which
// renders it back inside the panel (below suggestions/messages, above
// the composer) instead of as a separate floating element — same
// markup/design-token classes as the pre-migration original.
export function createContentStudioMolarAIFloat({ supabase, ...services }) {
  services = { ...createContentStudioSNAIService(supabase), ...services };

// PHASE 3C NOTE (Molar AI extraction): this file is now a LOCAL adapter
// only — the floating button, chat panel, message rendering, markdown,
// input/loading/error UI, and generic send/scroll/clear lifecycle all
// live in @mrburdeveloperteam/pet-function/ai's <SharedMolarAI>. This
// component's job is: (1) build the AIAdapter Content Studio's own
// business logic implements (see ../aiExperience/contentStudioMolarAdapter.js
// — moved mechanically, not rewritten), and (2) fetch the empty-state
// welcome title/subtitle/prompt-suggestions data this app has always
// pulled from AIBoard, reactively feeding it to the shared component.
//
// KNOWN, ACCEPTED TIMING SEAM (same pattern as Phase 3B's Welcome Back
// fetch): the empty-state AIBoard config now fetches once on mount
// rather than only when the panel is first opened, because the shared
// component's open/closed state is intentionally internal to it, not
// exposed back to hosts. This is one cheap, harmless, read-only query
// per page load — it has no effect on anything the user sees.
function MolarAIFloat({ userContext, disabled = false, onPetToggle, contentStudioUserId }) {
  // Phase-3 Data-Driven Chat: reads the Dashboard-published snapshot via
  // Context — never triggers a fetch of its own (see the Provider's own
  // file header). `not_loaded` on any route other than /dashboard.
  const { snapshot: contentStudioSnapshot } = useContentStudioDataChatContext();
  const contentStudioCurrentUserId = contentStudioUserId ?? null;

  const [emptyState, setEmptyState] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    const fetchSimConfig = async () => {
      try {
        const { data: configs } = await supabase
          .from('aiboard_simulator_configs')
          .select('id, title, subtitle')
          .eq('module_name', 'Content Studio')
          .limit(1);

        const fallbackPrompts = [
          { label: 'How does it work?', iconName: 'Zap' },
          { label: 'Show examples', iconName: 'ShieldCheck' },
          { label: 'Best practices', iconName: 'AlertCircle' },
          { label: 'Get help', iconName: 'BarChart3' },
        ];

        if (configs && configs.length > 0) {
          const title = configs[0].title;
          const subtitle = configs[0].subtitle || 'Ask a question or try one of the suggestions below to test the Content Studio AI.';

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

  const adapter = useMemo(
    () => createContentStudioAIAdapter({
      supabase,
      ...services,
      snapshot: contentStudioSnapshot,
      userId: contentStudioCurrentUserId,
      userContext: userContext || '',
    }),
    [contentStudioSnapshot, contentStudioCurrentUserId, userContext]
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

return MolarAIFloat;
}
