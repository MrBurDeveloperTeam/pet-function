'use client';
import { useEffect, useMemo, useState } from 'react';
import { SharedMolarAI } from '../../ai';
import type { MolarChatEmptyState } from '../../ai';
import { MOLAR_LOGO_URL } from '../../resources';
import { createAppGalleryMolarAdapter } from './appGalleryMolarAdapter';
import { getSuperappHostDependencies } from './dependencies';
export function SuperappMolarAIFloat({ userContext, disabled = false, onPetToggle }: { userContext: string; disabled?: boolean; onPetToggle?: () => void }) {
  const { supabase } = getSuperappHostDependencies();
  const DEFAULT_MOLAR_EMPTY_STATE: MolarChatEmptyState = {
    title: 'App.Snabbb Assistant',
    subtitle: 'Ready to assist with questions about App.Snabbb and its supported applications.',
    prompts: [
      { label: 'What is App.Snabbb?', iconName: 'Sparkles' },
      { label: 'What apps are available?', iconName: 'LayoutGrid' },
      { label: 'Tell me about the Inventory app', iconName: 'Package' },
      { label: 'Tell me about the Appointment app', iconName: 'CalendarClock' },
    ],
  };

  const [molarEmptyState, setMolarEmptyState] = useState<MolarChatEmptyState>(DEFAULT_MOLAR_EMPTY_STATE);

  useEffect(() => {
    let cancelled = false;
    const fetchSimConfig = async () => {
      try {
        const { data: configs } = await supabase
          .from('aiboard_simulator_configs')
          .select('id, title, subtitle')
          .eq('module_name', 'App.Snabbb')
          .limit(1);

        if (configs && configs.length > 0) {
          const title = configs[0].title || DEFAULT_MOLAR_EMPTY_STATE.title;
          const subtitle = configs[0].subtitle || DEFAULT_MOLAR_EMPTY_STATE.subtitle;

          const { data: promptData } = await supabase
            .from('aiboard_simulator_prompts')
            .select('text, icon_name, sort_order')
            .eq('config_id', configs[0].id)
            .order('sort_order', { ascending: true });

          const prompts = promptData && promptData.length > 0
            ? promptData.map((p: { text: string; icon_name: string }) => ({ label: p.text, iconName: p.icon_name }))
            : DEFAULT_MOLAR_EMPTY_STATE.prompts;

          if (!cancelled) setMolarEmptyState({ title, subtitle, prompts });
        }
        // No config row at all: keep the defaults already set at
        // initialization — no state write needed.
      } catch (err) {
        console.error('Error fetching sim configs:', err);
        // Query error: keep the defaults already set at initialization.
      }
    };

    fetchSimConfig();
    return () => { cancelled = true; };
  }, []);

  const molarAdapter = useMemo(
    () => createAppGalleryMolarAdapter({ userChatContext: userContext }),
    [userContext]
  );


  return <SharedMolarAI adapter={molarAdapter} disabled={disabled} onPetToggle={onPetToggle} emptyState={molarEmptyState} logoUrl={MOLAR_LOGO_URL} />;
}
