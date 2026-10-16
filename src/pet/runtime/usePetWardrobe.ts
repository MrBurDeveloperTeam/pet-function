import { useCallback, useEffect, useRef, useState } from 'react';
import type { PetRepository } from '../../contracts/petRepository';
import { emptyWardrobe, validateWardrobe, type WardrobeState, type WardrobeSlot } from '../internal/wardrobe.mjs';

const withDeadline = <T,>(promise: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Wardrobe request timed out')), 20000);
  promise.then(resolve, reject).finally(() => clearTimeout(timer));
});

export function usePetWardrobe(userId: string | null, repository: PetRepository, onCoins: (coins: number) => void) {
  const [saved, setSaved] = useState<{ owner: string | null; state: WardrobeState; status: 'loading' | 'ready' | 'error'; error: string | null }>({ owner: userId, state: emptyWardrobe(), status: 'loading', error: null });
  const [pending, setPending] = useState(false);
  const owner = useRef(userId); owner.current = userId;
  const mounted = useRef(true);
  const busy = useRef(false);
  const revision = useRef(0);
  const coinsCallback = useRef(onCoins); coinsCallback.current = onCoins;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; revision.current++; }; }, []);

  const reload = useCallback(async () => {
    if (busy.current) return;
    const request = ++revision.current;
    const valid = () => mounted.current && owner.current === userId && revision.current === request;
    if (!userId || !repository.loadWardrobe) {
      setSaved({ owner: userId, state: emptyWardrobe(), status: 'error', error: userId ? 'Your wardrobe is not available in this app yet.' : 'Sign in to save your outfits.' });
      return;
    }
    try {
      const state = validateWardrobe(await withDeadline(repository.loadWardrobe(userId)));
      if (valid()) setSaved({ owner: userId, state, status: 'ready', error: null });
    } catch {
      if (valid()) setSaved(previous => ({ owner: userId, state: previous.owner === userId ? previous.state : emptyWardrobe(), status: 'error', error: 'Could not load your wardrobe. Retry to check your saved items.' }));
    }
  }, [repository, userId]);

  useEffect(() => {
    busy.current = false; setPending(false);
    setSaved({ owner: userId, state: emptyWardrobe(), status: 'loading', error: null });
    void reload();
    const focus = () => { if (!document.hidden) void reload(); };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    return () => { revision.current++; window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
  }, [reload, userId]);

  const change = async (operation: () => Promise<{ state: WardrobeState; coins?: number }>) => {
    if (!userId || busy.current || saved.owner !== userId || saved.status !== 'ready') return false;
    busy.current = true; setPending(true);
    const request = ++revision.current;
    const valid = () => mounted.current && owner.current === userId && request === revision.current;
    try {
      const result = await withDeadline(operation());
      const state = validateWardrobe(result.state);
      if (!valid()) return false;
      setSaved({ owner: userId, state, status: 'ready', error: null });
      if (result.coins !== undefined) coinsCallback.current(result.coins);
      return true;
    } catch {
      if (valid()) setSaved(previous => ({ ...previous, status: 'error', error: 'Could not confirm this change. Retry to check your wardrobe before trying again.' }));
      return false;
    } finally {
      if (valid()) { busy.current = false; setPending(false); }
    }
  };

  const purchase = (itemId: string) => change(async () => {
    if (!repository.purchaseWardrobeItem || !userId) throw Error('Wardrobe unavailable');
    const result = await repository.purchaseWardrobeItem(userId, itemId);
    return { state: result.wardrobe, coins: result.coins };
  });
  const equip = (petId: string, slot: WardrobeSlot, itemId: string | null) => change(async () => {
    if (!repository.equipWardrobeItem || !userId) throw Error('Wardrobe unavailable');
    return { state: await repository.equipWardrobeItem(userId, petId, slot, itemId) };
  });
  const current = saved.owner === userId ? saved : { state: emptyWardrobe(), status: 'loading' as const, error: null };
  return { ...current, pending, reload, purchase, equip };
}

export type PetWardrobe = ReturnType<typeof usePetWardrobe>;
