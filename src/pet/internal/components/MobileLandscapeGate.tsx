import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const LandscapePauseContext = createContext(false);
export const useMobileLandscapePaused = () => useContext(LandscapePauseContext);

function needsRotation(orientation: 'landscape' | 'portrait' = 'landscape'): boolean {
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    || window.matchMedia('(pointer: coarse)').matches;
  return mobile && (orientation === 'portrait' ? window.innerWidth > window.innerHeight : window.innerHeight > window.innerWidth);
}

type LandscapeState = { blocked: boolean | null; admitted: boolean; resumeRequired: boolean };
type LandscapeAction = { type: 'rotate'; blocked: boolean } | { type: 'resume' };

export function landscapeGateReducer(state: LandscapeState, action: LandscapeAction): LandscapeState {
  if (action.type === 'resume') {
    return state.blocked === false ? { ...state, resumeRequired: false } : state;
  }
  return {
    blocked: action.blocked,
    admitted: state.admitted || !action.blocked,
    resumeRequired: state.resumeRequired || (state.admitted && action.blocked),
  };
}

/** Keep game code and its loading screen unmounted until landscape is available. */
export function MobileLandscapeGate({ game, title, onClose, children, orientation = 'landscape' }: {
  game: string; title: string; onClose: () => void; children: ReactNode; orientation?: 'landscape' | 'portrait';
}) {
  const direction = orientation === 'portrait' ? 'portrait' : 'landscape';
  const [{ blocked, admitted, resumeRequired }, dispatch] = useReducer(landscapeGateReducer, undefined, () => {
    const blocked = typeof window === 'undefined' ? null : needsRotation(orientation);
    return { blocked, admitted: blocked === false, resumeRequired: false };
  });
  const paused = blocked === true || resumeRequired;
  useEffect(() => {
    const update = () => {
      const blocked = needsRotation(orientation);
      if (blocked) document.querySelector<HTMLIFrameElement>(`iframe[data-landscape-game="${game}"]`)
        ?.contentWindow?.postMessage({ source: 'pet-function:orientation', paused: true }, window.location.origin);
      dispatch({ type: 'rotate', blocked });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.screen.orientation?.addEventListener('change', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.screen.orientation?.removeEventListener('change', update);
    };
  }, [game, orientation]);
  useEffect(() => {
    if (!admitted || blocked === null) return;
    // Repeat while the engine starts so rotating during loading also pauses it.
    const send = () => document.querySelector<HTMLIFrameElement>(`iframe[data-landscape-game="${game}"]`)
      ?.contentWindow?.postMessage({ source: 'pet-function:orientation', paused }, window.location.origin);
    send();
    const timer = window.setInterval(send, 500);
    return () => window.clearInterval(timer);
  }, [admitted, blocked, paused, game]);
  const resume = () => {
    // Recheck the viewport in case a rotation event is still queued.
    if (needsRotation(orientation)) { dispatch({ type: 'rotate', blocked: true }); return; }
    dispatch({ type: 'resume' });
  };
  return <>
    {admitted && <LandscapePauseContext.Provider value={paused}>{children}</LandscapePauseContext.Provider>}
    {paused && typeof document !== 'undefined' && createPortal(
      <div role="dialog" aria-modal="true" aria-label={blocked ? `Rotate to ${direction}` : 'Game paused'} data-pet-movement-block
        style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(10,20,24,.97)', color: '#fff1b8' }}>
        <div style={{ maxWidth: 340, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', boxSizing: 'border-box', textAlign: 'center', padding: 16, border: '3px solid #d9b86b', borderRadius: 16, background: '#203b43', boxShadow: '0 16px 60px #0008' }}>
          <div aria-hidden="true" style={{ fontSize: 'clamp(28px, 8dvh, 60px)' }}>{blocked ? '📱 ↻' : 'Ⅱ'}</div>
          <h2 style={{ fontSize: 24, margin: '8px 0' }}>{blocked ? `Rotate to ${direction}` : 'Game paused'}</h2>
          <p style={{ lineHeight: 1.7 }}>{!admitted ? `${title} requires ${direction} mode. Rotate your device to start loading the game.` : blocked ? `Game paused. Rotate back to ${direction}, then tap "Resume game".` : `${orientation === 'portrait' ? 'Portrait' : 'Landscape'} mode restored. Tap "Resume game" when you are ready.`}</p>
          {admitted && <button type="button" disabled={blocked !== false} onClick={resume}
            style={{ display: 'block', width: '100%', minHeight: 48, padding: '10px 24px', marginTop: 16, border: '2px solid #d9b86b', borderRadius: 8, background: '#fff1b8', color: '#203b43', fontWeight: 900, opacity: blocked ? .45 : 1, cursor: blocked ? 'not-allowed' : 'pointer' }}>Resume game</button>}
          <button type="button" onClick={onClose} style={{ minHeight: 48, padding: '10px 24px', marginTop: 12, border: '2px solid #d9b86b', borderRadius: 8, background: '#fff1b8', color: '#203b43', fontWeight: 900 }}>Back</button>
        </div>
      </div>, document.body
    )}
  </>;
}
