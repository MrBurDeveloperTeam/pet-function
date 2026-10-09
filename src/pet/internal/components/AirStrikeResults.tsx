import { useId, useRef } from 'react';
import { PixelCoinBag } from './CoinIndicator';

function CatExperienceIcon() {
  return <svg viewBox="0 0 32 32" shapeRendering="crispEdges" aria-hidden="true">
    <path fill="#172c36" d="M5 4h5l6 4 6-4h5v19h-3v5H8v-5H5z"/>
    <path fill="#e5b967" d="M6 3h4l6 5 6-5h4v20h-3v4H9v-4H6z"/>
    <path fill="#267f87" d="M8 7h2l6 5 6-5h2v14h-3v4H11v-4H8z"/>
    <path fill="#8ae8d5" d="M13 12h6v3h3v6h-3v3h-6v-3h-3v-6h3z"/>
    <path fill="#fff1b6" d="M15 12h2v4h4v2h-4v4h-2v-4h-4v-2h4z"/>
    <path fill="#e5b967" d="M2 15h7v2H2zM2 20h7v2H2zM23 15h7v2h-7zM23 20h7v2h-7z"/>
  </svg>;
}

interface AirStrikeResultsProps {
  result: { coins: number; xp: number; score: number; title: string };
  viewport: { width: number; height: number };
  stage: number;
  mode: string;
  pendingMessage?: string;
  onReturn: () => void;
  onReplay: () => void;
}

export function AirStrikeResults({ result, viewport, stage, mode, pendingMessage, onReturn, onReplay }: AirStrikeResultsProps) {
  const titleId = useId();
  const returnButton = useRef<HTMLButtonElement>(null);
  const replayButton = useRef<HTMLButtonElement>(null);
  const scale = Math.max(0.1, Math.min(1, (viewport.width - 24) / 1050, (viewport.height - 24) / 788));
  const cleared = result.title === 'MISSION CLEAR';
  return <div className="sky-results-shade">
    <style>{`
      .sky-results-shade{position:absolute;inset:0;z-index:20;display:grid;place-items:center;background:rgba(1,10,17,.82);backdrop-filter:blur(7px);isolation:isolate}
      .sky-results-fit{position:relative;animation:skyResultsReveal .28s ease-out both}
      .sky-results-board{position:absolute;left:0;top:0;width:1050px;height:788px;transform-origin:top left;color:#fff0c6;font-family:SkyPixel,monospace;text-align:center;filter:drop-shadow(0 20px 30px #000b)}
      .sky-results-art{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none;user-select:none}
      .sky-results-content{position:absolute;left:21%;right:21%;top:29%;bottom:33%;display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box;padding:8px 12px 24px}
      .sky-results-eyebrow{font-size:11px;letter-spacing:3px;color:#9cb8bf;margin:0 0 8px}
      .sky-results-title{font:32px/1.2 SkyPixel,monospace;color:#ffcf88;margin:0;text-shadow:2px 3px #08121b}
      .sky-results-board.cleared .sky-results-title{color:#9af4db}
      .sky-results-score{display:flex;align-items:center;justify-content:center;gap:14px;margin:8px 0 0;color:#abc5ca;font-size:13px;letter-spacing:2px}
      .sky-results-score strong{font-size:24px;color:#fff3d1;letter-spacing:1px;font-weight:normal}
      .sky-results-rewards{display:grid;grid-template-columns:1fr 1fr;gap:42px;width:100%;max-width:400px;margin:12px 0 16px;padding:10px 20px;background:linear-gradient(90deg,#091d2800,#22495766,#091d2800);border-top:1px solid #47758388;border-bottom:1px solid #47758388;box-sizing:border-box}
      .sky-results-reward{display:grid;grid-template-columns:48px auto;align-items:center;column-gap:12px;text-align:left}
      .sky-results-reward svg{width:48px;height:48px;grid-row:1/3;filter:drop-shadow(2px 3px 0 #06141b)}
      .sky-results-reward strong{font:27px/1.2 SkyPixel,monospace;color:#ffda8b;white-space:nowrap}
      .sky-results-reward.xp strong{color:#95efdc}
      .sky-results-reward small{font-size:10px;letter-spacing:1px;color:#b6cbd0;margin-top:5px}
      .sky-results-actions{display:grid;grid-template-columns:1fr 1fr;gap:18px;width:100%;max-width:480px}
      .sky-results-actions button{position:relative;box-sizing:border-box;height:48px;padding:0 12px;border:2px solid #769da3;background:linear-gradient(#315461,#17303e);color:#d9eeea;box-shadow:inset 0 0 0 3px #0c2231,0 4px 0 #06121b;font:13px SkyPixel,monospace;cursor:pointer;transition:filter .15s,transform .15s}
      .sky-results-actions button:last-child{border-color:#efca80;background:linear-gradient(#edc678,#b7813c);color:#182d39;box-shadow:inset 0 0 0 3px #9b6e32,0 4px 0 #06121b}
      .sky-results-actions button:hover{filter:brightness(1.18);transform:translateY(-2px)}
      .sky-results-actions button:active{transform:translateY(2px)}
      .sky-results-actions button:focus-visible{outline:3px solid #b7fff2;outline-offset:4px}
      .sky-results-pending{position:absolute;bottom:2px;left:0;right:0;font:11px/1.3 system-ui,sans-serif;color:#b4ced0;margin:0}
      @keyframes skyResultsReveal{from{opacity:0;transform:translateY(12px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
      @media(prefers-reduced-motion:reduce){.sky-results-fit{animation:none}.sky-results-actions button{transition:none}}
    `}</style>
    <div className="sky-results-fit" style={{ width: 1050 * scale, height: 788 * scale }}>
      <section className={`sky-results-board${cleared ? ' cleared' : ''}`} style={{ transform: `scale(${scale})` }} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={event => {
        if (event.key === 'Tab') {
          event.preventDefault();
          (document.activeElement === returnButton.current ? replayButton : returnButton).current?.focus();
        }
      }}>
        <img className="sky-results-art" src="/games/air-strike/mission-results-frame.png" alt="" draggable={false}/>
        <div className="sky-results-content">
          <p className="sky-results-eyebrow">{mode === 'endless' ? 'ENDLESS FLIGHT' : `STAGE ${String(stage).padStart(3, '0')}`} / SKY PATROL</p>
          <h2 id={titleId} className="sky-results-title">{result.title}</h2>
          <p className="sky-results-score"><span>SCORE</span><strong>{result.score.toLocaleString()}</strong></p>
          <div className="sky-results-rewards">
            <div className="sky-results-reward"><PixelCoinBag/><strong>+{result.coins.toLocaleString()}</strong><small>COINS</small></div>
            <div className="sky-results-reward xp"><CatExperienceIcon/><strong>+{result.xp.toLocaleString()}</strong><small>CAT XP</small></div>
          </div>
          <div className="sky-results-actions">
            <button ref={returnButton} autoFocus onClick={onReturn}>RETURN TO HANGAR</button>
            <button ref={replayButton} onClick={onReplay}>FLY AGAIN →</button>
          </div>
          {pendingMessage && <p className="sky-results-pending" role="status">{pendingMessage}</p>}
        </div>
      </section>
    </div>
  </div>;
}
