import { useEffect, useRef, useState } from 'react';
import { useGameState } from '../../runtime/SharedPetRuntime';
import { normalizePetId } from '../petOptions';

export function KartGame({ onClose }: { onClose: () => void }) {
  const { petName } = useGameState();
  const iframe = useRef<HTMLIFrameElement>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin === location.origin && event.source === iframe.current?.contentWindow
        && event.data?.source === 'cat-kart' && event.data?.type === 'KART_CLOSE') onClose();
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onClose]);
  return <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#254451' }}>
    <iframe key={retry} ref={iframe} title="Cat Kart — 3D Town Sprint"
      src={`/games/cat-kart/index.html?embedded=1&cat=${encodeURIComponent(normalizePetId(petName))}`}
      allow="autoplay; fullscreen" style={{ width: '100%', height: '100%', border: 0, display: 'block' }} />
    <div style={{ position: 'absolute', right: 16, top: 16, display: 'flex', gap: 8 }}>
      <button onClick={() => setRetry(value => value + 1)} style={{ padding: '8px 12px', background: '#fff3d0', color: '#254451' }}>Reload</button>
      <button onClick={onClose} style={{ padding: '8px 12px', background: '#fff3d0', color: '#254451' }}>Back to kart track</button>
    </div>
  </div>;
}
