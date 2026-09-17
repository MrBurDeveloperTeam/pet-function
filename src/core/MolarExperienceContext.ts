'use client';

import { createContext, useContext } from 'react';
import type { MolarExperienceConfig } from '../contracts';

/**
 * Internal context. Not exported publicly — hosts consume the package only
 * through <MolarExperienceProvider> and the public domain components
 * (SharedCatMascot / SharedMolarAI / SharedVirtualPet / MolarExperienceLayer),
 * never through this context object directly.
 */
export const MolarExperienceContext = createContext<MolarExperienceConfig | null>(null);

/** Internal hook used by domain entry components. Not exported publicly. */
export function useMolarExperienceConfig(): MolarExperienceConfig {
  const config = useContext(MolarExperienceContext);
  if (!config) {
    throw new Error(
      '[pet-function] A domain component was rendered outside <MolarExperienceProvider>.'
    );
  }
  return config;
}

/** Same as useMolarExperienceConfig, but does not throw — used by
 *  components that may legitimately render before the provider mounts. */
export function useMolarExperienceConfigOptional(): MolarExperienceConfig | null {
  return useContext(MolarExperienceContext);
}
