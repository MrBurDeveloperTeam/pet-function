'use client';

import type { ReactNode } from 'react';
import type { MolarExperienceConfig } from '../contracts';
import { MolarExperienceContext } from './MolarExperienceContext';

export interface MolarExperienceProviderProps {
  config: MolarExperienceConfig;
  children: ReactNode;
}

/**
 * Root composition provider.
 *
 * Framework-neutral: no router import, no Supabase import, no host-specific
 * context, no `window.__MOLAR_ACTIONS__`-style global, no network requests,
 * no business logic. It normalizes nothing and validates nothing beyond
 * making `config` available to the domain entry components — all real
 * dialogue/AI/pet behavior lands in a later implementation phase.
 */
export function MolarExperienceProvider({ config, children }: MolarExperienceProviderProps) {
  return (
    <MolarExperienceContext.Provider value={config}>{children}</MolarExperienceContext.Provider>
  );
}
