import { useEffect, useRef, useState } from 'react';
import { useGameState } from '../../runtime/SharedPetRuntime';
import { FOOTBALL_SOURCE, FootballSettlement } from '../footballRewards';

export function FootballGame({ onClose, userId }: { onClose: () => void; userId: string | null }) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const settlement = useRef(new FootballSettlement());
  const { addCoins, addXP } = useGameState();
  const [error, setError] = useState(false);
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframe.current?.contentWindow
        || event.data?.source !== FOOTBALL_SOURCE) return;
      const message = event.data;
      const tutorialKey = `snabbb_pet:${userId ?? 'guest'}:football_tutorial_v1`;
      if (message.type === 'FOOTBALL_READY') {
        let seen = false;
        try { seen = localStorage.getItem(tutorialKey) === 'done'; } catch { /* Training remains available without storage. */ }
        iframe.current?.contentWindow?.postMessage({ type: 'FOOTBALL_INIT', tutorialSeen: seen }, window.location.origin);
      }
      if (message.type === 'FOOTBALL_TUTORIAL_DONE') {
        try { localStorage.setItem(tutorialKey, 'done'); } catch { /* Storage can be unavailable in private browsers. */ }
      }
      if (message.type === 'FOOTBALL_ERROR') setError(true);
      if (message.type === 'FOOTBALL_STARTED') settlement.current.start(message.matchId, performance.now());
      if (message.type === 'FOOTBALL_COMPLETE') {
        const reward = settlement.current.complete(message, performance.now());
        if (reward) { addCoins(reward.coins); addXP(reward.xp); }
      }
      if (message.type === 'FOOTBALL_CLOSE') onClose();
    };
    const pause = () => {
      if (document.hidden) iframe.current?.contentWindow?.postMessage({ type: 'FOOTBALL_PAUSE' }, window.location.origin);
    };
    window.addEventListener('message', handleMessage);
    document.addEventListener('visibilitychange', pause);
    return () => {
      window.removeEventListener('message', handleMessage);
      document.removeEventListener('visibilitychange', pause);
    };
  }, [addCoins, addXP, onClose, userId]);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#182a23' }}>
      <iframe ref={iframe} src="/games/stadium-football/index.html?embedded=1" title="Paw League — 3D cat football"
        allow="autoplay; fullscreen" style={{ width: '100%', height: '100%', border: 0, display: 'block' }} />
      {error && <button type="button" onClick={onClose} style={{ position: 'absolute', left: 20, top: 18,
        padding: '12px 20px', background: '#fff1cb', color: '#243e37', border: '2px solid #b8a477' }}>返回体育场</button>}
    </div>
  );
}
