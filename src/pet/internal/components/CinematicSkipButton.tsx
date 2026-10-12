export function CinematicSkipButton({onSkip}:{onSkip:()=>void}) {
 return <>
  <style>{`
   .pet-cinematic-skip{position:absolute;left:max(24px,env(safe-area-inset-left));bottom:max(24px,env(safe-area-inset-bottom));z-index:50;display:flex;align-items:center;gap:10px;min-height:44px;padding:10px 16px;border:2px solid #c5aa69;background:#0b1d2deb;box-shadow:3px 3px 0 #0008,inset 0 0 0 2px #29424d;color:#fff0c5;font:700 13px/1.2 system-ui,sans-serif;letter-spacing:.06em;cursor:pointer;touch-action:manipulation}
   .pet-cinematic-skip:hover{background:#294652;border-color:#9beadd}.pet-cinematic-skip:active{transform:translate(2px,2px)}.pet-cinematic-skip:focus-visible{outline:3px solid #9beadd;outline-offset:4px}.pet-cinematic-skip svg{width:18px;height:18px}
  `}</style>
  <button type="button" autoFocus className="pet-cinematic-skip" data-cinematic-skip onClick={onSkip} aria-label="Skip animation">
   <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M2 3l7 7-7 7V3zm7 0l7 7-7 7V3zm8 0h2v14h-2z"/></svg>SKIP ANIMATION
  </button>
 </>;
}
