import { getSuperappHostDependencies } from '../dependencies';

// Small typed helper so the raw env check lives in exactly one place instead
// of being scattered across CatMascot/App as inline `import.meta.env` reads.
export function isPersonalizedPetDialogueEnabled(): boolean {
  return getSuperappHostDependencies().personalizedDialogueEnabled;
}
