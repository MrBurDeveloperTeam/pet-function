import { useCallback, useEffect, useRef, useState } from 'react';
import type { PetRepository } from '../../contracts/petRepository';
import { emptyCabinets, validateCabinets, type CabinetState, type CabinetRoom } from '../internal/cabinets.mjs';

const withDeadline = <T,>(promise: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Cabinets request timed out')), 20000);
  promise.then(resolve, reject).finally(() => clearTimeout(timer));
});

export function usePetCabinets(userId: string | null, repository: PetRepository, onCoins: (coins: number) => void) {
  const [saved, setSaved] = useState<{ owner: string | null; state: CabinetState; status: 'loading' | 'ready' | 'error'; error: string | null }>({ owner: userId, state: emptyCabinets(), status: 'loading', error: null });
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
    if (!userId || !repository.loadCabinets) {
      setSaved({ owner: userId, state: emptyCabinets(), status: 'error', error: userId ? 'Cabinet customization is not available in this app yet.' : 'Sign in to save your cabinet styles.' });
      return;
    }
    try {
      const state = validateCabinets(await withDeadline(repository.loadCabinets(userId)));
      if (valid()) setSaved({ owner: userId, state, status: 'ready', error: null });
    } catch {
      if (valid()) setSaved(previous => ({ owner: userId, state: previous.owner === userId ? previous.state : emptyCabinets(), status: 'error', error: 'Could not load your cabinets. Retry to check your saved items.' }));
    }
  }, [repository, userId]);

  useEffect(() => {
    busy.current = false; setPending(false);
    setSaved({ owner: userId, state: emptyCabinets(), status: 'loading', error: null });
    void reload();
    const focus = () => { if (!document.hidden) void reload(); };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    return () => { revision.current++; window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
  }, [reload, userId]);

  const change = async (operation: () => Promise<{ state: CabinetState; coins?: number }>) => {
    if (!userId || busy.current || saved.owner !== userId || saved.status !== 'ready') return false;
    busy.current = true; setPending(true);
    const request = ++revision.current;
    const valid = () => mounted.current && owner.current === userId && request === revision.current;
    try {
      const result = await withDeadline(operation());
      const state = validateCabinets(result.state);
      if (!valid()) return false;
      setSaved({ owner: userId, state, status: 'ready', error: null });
      if (result.coins !== undefined) coinsCallback.current(result.coins);
      return true;
    } catch {
      if (valid()) setSaved(previous => ({ ...previous, status: 'error', error: 'Could not confirm this change. Retry to check your cabinets before trying again.' }));
      return false;
    } finally {
      if (valid()) { busy.current = false; setPending(false); }
    }
  };

  const purchase = (itemId: string) => change(async () => {
    if (!repository.purchaseCabinetItem || !userId) throw Error('Cabinets unavailable');
    const result = await repository.purchaseCabinetItem(userId, itemId);
    return { state: result.cabinets, coins: result.coins };
  });
  const select = (room: CabinetRoom, itemId: string | null) => change(async () => {
    if (!repository.selectCabinetItem || !userId) throw Error('Cabinets unavailable');
    return { state: await repository.selectCabinetItem(userId, room, itemId) };
  });

  const current = saved.owner === userId ? saved : { state: emptyCabinets(), status: 'loading' as const, error: null };
  return { ...current, pending, reload, purchase, select, version: revision.current };
}

export type PetCabinets = ReturnType<typeof usePetCabinets>;
