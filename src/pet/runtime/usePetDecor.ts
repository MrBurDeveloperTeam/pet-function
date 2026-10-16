import { useCallback, useEffect, useRef, useState } from 'react';
import type { PetRepository } from '../../contracts/petRepository';
import { emptyDecor, validateDecor, type DecorState } from '../internal/roomDecor.mjs';

const withDeadline = <T,>(promise: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Room decor request timed out')), 20000);
  promise.then(resolve, reject).finally(() => clearTimeout(timer));
});

export function usePetDecor(userId: string | null, repository: PetRepository, onCoins: (coins: number) => void) {
  const [saved, setSaved] = useState<{ owner: string | null; state: DecorState; status: 'loading' | 'ready' | 'error'; error: string | null }>({ owner: userId, state: emptyDecor(), status: 'loading', error: null });
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
    if (!userId || !repository.loadDecor) {
      setSaved({ owner: userId, state: emptyDecor(), status: 'error', error: userId ? 'Room customization is not available in this app yet.' : 'Sign in to save your room styles.' });
      return;
    }
    try {
      const state = validateDecor(await withDeadline(repository.loadDecor(userId)));
      if (valid()) setSaved({ owner: userId, state, status: 'ready', error: null });
    } catch {
      if (valid()) setSaved(previous => ({ owner: userId, state: previous.owner === userId ? previous.state : emptyDecor(), status: 'error', error: 'Could not load your room decor. Retry to check your saved items.' }));
    }
  }, [repository, userId]);

  useEffect(() => {
    busy.current = false; setPending(false);
    setSaved({ owner: userId, state: emptyDecor(), status: 'loading', error: null });
    void reload();
    const focus = () => { if (!document.hidden) void reload(); };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    return () => { revision.current++; window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
  }, [reload, userId]);

  const change = async (operation: () => Promise<{ state: DecorState; coins?: number }>) => {
    if (!userId || busy.current || saved.owner !== userId || saved.status !== 'ready') return false;
    busy.current = true; setPending(true);
    const request = ++revision.current;
    const valid = () => mounted.current && owner.current === userId && request === revision.current;
    try {
      const result = await withDeadline(operation());
      const state = validateDecor(result.state);
      if (!valid()) return false;
      setSaved({ owner: userId, state, status: 'ready', error: null });
      if (result.coins !== undefined) coinsCallback.current(result.coins);
      return true;
    } catch {
      if (valid()) setSaved(previous => ({ ...previous, status: 'error', error: 'Could not confirm this change. Retry to check your room decor before trying again.' }));
      return false;
    } finally {
      if (valid()) { busy.current = false; setPending(false); }
    }
  };

  const purchase = (itemId: string) => change(async () => {
    if (!repository.purchaseDecorItem || !userId) throw Error('Room decor unavailable');
    const result = await repository.purchaseDecorItem(userId, itemId);
    return { state: result.decor, coins: result.coins };
  });
  const select = (room: string, itemId: string | null) => change(async () => {
    if (!repository.selectDecorItem || !userId) throw Error('Room decor unavailable');
    return { state: await repository.selectDecorItem(userId, room, itemId) };
  });

  const current = saved.owner === userId ? saved : { state: emptyDecor(), status: 'loading' as const, error: null };
  return { ...current, pending, reload, purchase, select, version: revision.current };
}

export type PetDecor = ReturnType<typeof usePetDecor>;
