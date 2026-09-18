import { normalizePetId } from '../pet/publicOptions';

export type CatAuthStatus = 'loading' | 'guest' | 'authenticated';

export const getSharedPetNameStorageKey = (userId: string | null): string | null =>
  userId ? `snabbb_pet:${userId}:pet_name` : null;

export const readSharedPetName = (userId: string | null): string | null => {
  const key = getSharedPetNameStorageKey(userId);
  if (!key || typeof window === 'undefined') return null;
  try { return localStorage.getItem(key); } catch { return null; }
};

export const writeSharedPetName = (userId: string | null, petName: string | null): void => {
  const key = getSharedPetNameStorageKey(userId);
  if (!key || typeof window === 'undefined') return;
  try {
    if (petName) localStorage.setItem(key, normalizePetId(petName));
    else localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in browser privacy modes.
  }
};

export const resolveCatAuthStatus = (
  explicitStatus: CatAuthStatus | undefined,
  disabled: boolean,
  userId: string | null,
): CatAuthStatus => explicitStatus ?? (disabled ? 'guest' : userId ? 'authenticated' : 'loading');
