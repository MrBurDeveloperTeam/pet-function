'use client';
import { createAppointmentSNAIService } from './snaiService';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SharedMolarAI } from '../../ai';

import { createAppointmentsMolarAdapter } from './appointmentsMolarAdapter';
import { createGroundedContextStore } from './dataChat/context/groundedConversationContext';
import { MOLAR_LOGO_URL } from '../../resources';

export function createAppointmentMolarAIFloat({supabase, ...services}) {
  services = { ...createAppointmentSNAIService(supabase), ...services };

/** Restores the "Persistent support shortcut" already live in production's
 *  legacy MolarChat.jsx (PR #66, "add ticket link in AI button") — same
 *  Gmail-compose target/copy, now rendered via molar-experience 0.9.5's
 *  `footerContent` instead of bespoke markup inside the old chat panel.
 *  Distinct from the separate Header ticketing-SSO link — both survive. */

// PHASE 8D (Molar AI migration): thin host wrapper around
// `@mrburdeveloperteam/pet-function/ai`'s <SharedMolarAI>. Generic chat
// lifecycle (open/closed, history, input draft, loading, empty-submit/
// duplicate-submit guards, clear, auto-scroll, Markdown, floating trigger +
// panel presentation) is now entirely owned by the shared package — ported
// byte-identical from this file's own pre-8D `MolarAIFloat.jsx`/
// `MolarChat.jsx` (confirmed via reading the installed `dist/ai.js`
// directly). Every actual response — General Chat, Data Chat, Gemini calls
// (now server-proxied via the shared "snai-chat" Edge
// Function, never a client-side API key) — is entirely local, in
// `../aiExperience/appointmentsMolarAdapter.ts`. That adapter has no
// mutation-dispatch capability (removed in phase
// APPOINTMENT-MOLAR-AI-P0-SECURITY-HARDENING).
function MolarAIFloat({
  userContext,
  disabled = false,
  onPetToggle,
  appointments = [],
  rooms = [],
  appointmentDataStatus = 'loading',
  loadedAppointmentRange = null,
  // Only read by the `appointment_today_list` Data Chat intent (see
  // ../aiExperience/dataChat/providers/todayScheduleDataProvider.ts) to
  // resolve patient/dentist/treatment display names for that one
  // intent's own response — never sent to Gemini.
  patients = [],
  staff = [],
  treatments = [],
}) {
  // Empty-state content (title/subtitle/prompts) — KNOWN, ACCEPTED TIMING
  // SEAM (same pattern established across every prior app's Molar AI
  // migration in this series): the pre-8D `MolarChat.jsx` fetched this only
  // when the panel opened (`if (isOpen) fetchSimConfig()`); this fetches
  // once on mount instead, since `SharedMolarAI` has no panel-open lifecycle
  // hook exposed to the host. One extra harmless read query per mount,
  // never changes what's displayed.
  const [emptyState, setEmptyState] = useState({
    title: 'Appointment Simulator',
    subtitle: 'Ready to assist with appointments, clinic operations, and staff metrics.',
    prompts: [
      { label: "Check today's appointments", iconName: 'Zap' },
      { label: 'Manage pending requests', iconName: 'ShieldCheck' },
      { label: 'View clinic alerts', iconName: 'AlertCircle' },
      { label: 'Clinic performance', iconName: 'BarChart3' },
    ],
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: configs } = await supabase
          .from('aiboard_simulator_configs')
          .select('id, title, subtitle')
          .eq('module_name', 'Appointment')
          .limit(1);

        if (!configs || configs.length === 0) return;

        const { data: promptData } = await supabase
          .from('aiboard_simulator_prompts')
          .select('text, icon_name, sort_order')
          .eq('config_id', configs[0].id)
          .order('sort_order', { ascending: true });

        if (cancelled) return;

        setEmptyState((prev) => ({
          title: configs[0].title,
          subtitle: configs[0].subtitle || 'Ready to assist with appointments, clinic operations, and staff metrics.',
          prompts:
            promptData && promptData.length > 0
              ? promptData.map((p) => ({ label: p.text, iconName: p.icon_name }))
              : prev.prompts,
        }));
      } catch (err) {
        console.error('Error fetching sim configs:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Grounded follow-up context store — stable for this component's own
  // mount (App.jsx keys MolarAIFloat's identity boundary the same way it
  // already keys CatMascot/AppointmentsVirtualPet, so a fresh store is
  // created on account/clinic switch) so it survives `adapter` below
  // being rebuilt on ordinary appointments/rooms/status data refreshes.
  const groundedContextStoreRef = useRef(createGroundedContextStore());

  const adapter = useMemo(
    () =>
      createAppointmentsMolarAdapter({
        supabase, ...services,
        userContext: userContext || '',
        appointments,
        rooms,
        appointmentDataStatus,
        loadedAppointmentRange,
        patients,
        staff,
        treatments,
        groundedContextStore: groundedContextStoreRef.current,
      }),
    [userContext, appointments, rooms, appointmentDataStatus, loadedAppointmentRange, patients, staff, treatments]
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
