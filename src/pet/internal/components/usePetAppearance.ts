import { useEffect, useState } from 'react';
import { petAppearanceLayers, type CatOutfit } from '../wardrobe.mjs';
import { createSpriteTextureCache } from '../spriteTextureCache.mjs';

const textures = createSpriteTextureCache(() => new Image());

export function usePetAppearance(petId: string, outfit: CatOutfit | undefined, original: string) {
  const identity = `${petId}|${original}`;
  const requested = petAppearanceLayers(petId, outfit, original);
  const requestKey = JSON.stringify(requested);
  const [loaded, setLoaded] = useState({ identity, key: '', layers: [original], failed: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const layers = JSON.parse(requestKey) as string[];
    if (typeof Image !== 'undefined') {
      void textures.loadAll(layers).then(() => {
        if (!cancelled) setLoaded({ identity, key: requestKey, layers, failed: false });
      }).catch(() => {
        if (!cancelled) setLoaded({ identity, key: requestKey, layers: [original], failed: true });
      });
    }
    return () => { cancelled = true; };
  }, [identity, requestKey, original, attempt]);

  useEffect(() => {
    const retry = () => { if (!document.hidden) setAttempt(value => value + 1); };
    window.addEventListener('online', retry);
    window.addEventListener('focus', retry);
    return () => { window.removeEventListener('online', retry); window.removeEventListener('focus', retry); };
  }, []);

  // Unequipping returns to the original immediately. A different cat must never
  // briefly inherit the previously visible cat's outfit while its atlas loads.
  const noEquipment = requested.length === 1 && requested[0] === original;
  const ready = textures.isReady(requested);
  const sameCat = loaded.identity === identity;
  return {
    layers: noEquipment ? [original] : ready ? requested : sameCat ? loaded.layers : [original],
    status: noEquipment || ready ? 'ready' : sameCat && loaded.key === requestKey && loaded.failed ? 'error' : 'loading',
  };
}
