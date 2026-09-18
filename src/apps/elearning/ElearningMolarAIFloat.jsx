"use client";
import { createElearningSNAIService } from './snaiService';
import { useEffect, useMemo, useState } from 'react';
import { SharedMolarAI } from '../../ai';
import { createElearningMolarAdapter } from './elearningMolarAdapter';
import { MOLAR_LOGO_URL } from '../../resources';

// Carried over from the pre-migration local MolarChat.jsx panel, which
// rendered this exact card inside its own chat window (removed along
// with the rest of that file's now-shared-package-owned UI). Restored
// via molar-experience 0.9.5's SharedMolarAIProps.footerContent, which
// renders it back inside the panel (below suggestions/messages, above
// the composer) instead of as a separate floating element — same
// markup/CSS classes (src/index.css) as the pre-migration original.
export function createElearningMolarAIFloat({ supabase, useElearningDataChatSources, ...services }) {
  services = { ...createElearningSNAIService(supabase), ...services };

const DEFAULT_EMPTY_STATE = {
  title: 'E-learning Simulator',
  subtitle: 'Ask a question or try one of the suggestions below to test the E-learning AI.',
  prompts: [],
};

const FALLBACK_PROMPTS = [
  { label: 'How does it work?', iconName: 'Zap' },
  { label: 'Show examples', iconName: 'Lightbulb' },
  { label: 'Best practices', iconName: 'Star' },
  { label: 'Get help', iconName: 'Info' },
];

/**
 * Thin host wrapper around `@mrburdeveloperteam/pet-function/ai`'s
 * <SharedMolarAI>. All generic chat UI lifecycle (open/close, history,
 * input draft, loading/error presentation, submit mechanics, scroll,
 * clear/reset, Markdown rendering) now lives in the shared package. This
 * file keeps only what's genuinely E-Learning-specific: the General
 * Chat/Data Chat orchestration (in `elearningMolarAdapter.ts`), the
 * Phase-3 Data Chat sources, and the empty-state content fetch.
 */
function ElearningMolarAIFloat({ userContext, disabled = false, onPetToggle }) {
  // Phase-3 Data-Driven Chat: reads existing React Query cache only —
  // never triggers a fetch of its own (see the hook's own file header).
  const dataChatSources = useElearningDataChatSources();

  const adapter = useMemo(
    () => createElearningMolarAdapter({ userContext: userContext || '', dataChatSources, supabase, ...services }),
    [userContext, dataChatSources]
  );

  const [emptyState, setEmptyState] = useState(DEFAULT_EMPTY_STATE);

  // TIMING SEAM: the pre-migration MolarChat.jsx fetched this only once the
  // chat panel opened (`if (isOpen) fetchSimConfig()`); SharedMolarAI needs
  // `emptyState` already resolved, so this now fetches once at mount
  // instead — one additional harmless read-only Supabase query per mount,
  // matching the accepted precedent from every other app's Molar AI
  // migration in this session.
  useEffect(() => {
    const fetchSimConfig = async () => {
      try {
        const { data: configs } = await supabase
          .from('aiboard_simulator_configs')
          .select('id, title, subtitle')
          .eq('module_name', 'E-learning')
          .limit(1);

        if (configs && configs.length > 0) {
          const { data: promptData } = await supabase
            .from('aiboard_simulator_prompts')
            .select('text, icon_name, sort_order')
            .eq('config_id', configs[0].id)
            .order('sort_order', { ascending: true });

          const prompts = promptData && promptData.length > 0
            ? promptData.map((p) => ({ label: p.text, iconName: p.icon_name }))
            : FALLBACK_PROMPTS;

          setEmptyState({
            title: configs[0].title,
            subtitle: configs[0].subtitle || DEFAULT_EMPTY_STATE.subtitle,
            prompts,
          });
        } else {
          setEmptyState({ ...DEFAULT_EMPTY_STATE, prompts: FALLBACK_PROMPTS });
        }
      } catch (err) {
        console.error('Error fetching sim configs:', err);
      }
    };

    fetchSimConfig();
  }, []);

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
return ElearningMolarAIFloat;
}
