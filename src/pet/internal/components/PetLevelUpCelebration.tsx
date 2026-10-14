import {useEffect,useRef,type CSSProperties} from 'react';
import crest from '../../../assets/level-up-crest-v1.webp';

export function PetLevelUpCelebration({level,onDone}:{level:number;onDone:()=>void}) {
 const finish=useRef(onDone);finish.current=onDone;
 useEffect(()=>{
  let context:AudioContext|undefined;
  try{
   context=new AudioContext();void context.resume().catch(()=>{});
   const master=context.createGain();master.gain.value=.07;master.connect(context.destination);
   [261.63,329.63,392,523.25,659.25,783.99].forEach((frequency,i)=>{
    const tone=context!.createOscillator(),volume=context!.createGain();
    const start=context!.currentTime+.08+i*.09;
    tone.type='triangle';tone.frequency.value=frequency;
    volume.gain.setValueAtTime(0,start);volume.gain.linearRampToValueAtTime(.5,start+.025);volume.gain.exponentialRampToValueAtTime(.001,start+1.1);
    tone.connect(volume);volume.connect(master);tone.start(start);tone.stop(start+1.15);
   });
  }catch{/* The celebration also works when audio is unavailable. */}
  const timer=window.setTimeout(()=>finish.current(),3800);
  return()=>{clearTimeout(timer);if(context)void context.close().catch(()=>{});};
 },[]);
 return <div className="pet-level-celebration" role="status" aria-live="polite" aria-label={`Level up! Level ${level}`}>
  <style>{`
   .pet-level-celebration{position:fixed;inset:0;z-index:1500;pointer-events:none;display:grid;place-items:center;overflow:hidden;isolation:isolate;animation:petLevelExit 3.8s both}
   .pet-level-shade{position:absolute;inset:0;background:radial-gradient(ellipse,#072b3366,#020b16b8);animation:petLevelShade 3.8s both}
   .pet-level-flash{position:absolute;inset:0;background:#fff6d4;animation:petLevelFlash .65s ease-out both}
   .pet-level-rays{position:absolute;width:min(140vw,1100px);aspect-ratio:1;background:repeating-conic-gradient(from 0deg,#ffdf8066 0deg 4deg,transparent 4deg 22deg);mask-image:radial-gradient(circle,transparent 12%,#000 25%,transparent 68%);animation:petLevelRays 3.8s ease-out both}
   .pet-level-ring{position:absolute;width:min(55vw,450px);aspect-ratio:1;border:3px solid #ffe7a1;border-radius:50%;box-shadow:0 0 18px #f6cc63,inset 0 0 16px #a6ffea;animation:petLevelRing 1.4s var(--delay) ease-out both}
   .pet-level-star{position:absolute;left:50%;top:50%;width:clamp(8px,2vw,20px);aspect-ratio:1;background:#fff1b0;clip-path:polygon(50% 0,60% 37%,100% 50%,60% 63%,50% 100%,40% 63%,0 50%,40% 37%);animation:petLevelStar 2.6s var(--delay) cubic-bezier(.1,.7,.2,1) both}
   .pet-level-message{position:relative;width:min(90vw,650px,80dvh);aspect-ratio:1;animation:petLevelMessage 3.8s cubic-bezier(.2,.8,.2,1) both;text-align:center;color:#fff0bd;font-family:system-ui,sans-serif}
   .pet-level-crest{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 10px 20px #0009)}
   .pet-level-title{position:absolute;top:5%;left:0;right:0;font-size:clamp(22px,5vw,44px);font-weight:950;letter-spacing:.12em;color:#fff1c4;text-shadow:0 3px 0 #725020,0 0 18px #ffda78}
   .pet-level-number{position:absolute;left:0;right:0;top:66%;font-size:clamp(36px,9vw,76px);font-weight:950;line-height:1;color:#e3fff4;text-shadow:0 3px 0 #093f43,0 0 22px #62eaca}
   .pet-level-number small{display:block;font-size:clamp(10px,2vw,16px);letter-spacing:.25em;color:#f1d68c;margin-bottom:8px}
   @keyframes petLevelMessage{0%{opacity:0;transform:scale(.25) translateY(60px) rotate(-7deg)}12%{opacity:1;transform:scale(1.08) translateY(0) rotate(2deg)}22%,85%{opacity:1;transform:scale(1) rotate(0)}100%{opacity:0;transform:scale(1.06) translateY(-25px)}}
   @keyframes petLevelExit{0%,88%{opacity:1}100%{opacity:0}}
   @keyframes petLevelShade{0%{opacity:0}12%,85%{opacity:1}100%{opacity:0}}
   @keyframes petLevelFlash{0%{opacity:0}20%{opacity:.8}100%{opacity:0}}
   @keyframes petLevelRays{0%{opacity:0;transform:scale(.4) rotate(-15deg)}16%{opacity:1}100%{opacity:0;transform:scale(1.15) rotate(30deg)}}
   @keyframes petLevelRing{0%{opacity:0;transform:scale(.2)}15%{opacity:1}100%{opacity:0;transform:scale(2.4)}}
   @keyframes petLevelStar{0%{opacity:0;transform:translate(-50%,-50%) scale(.1)}12%{opacity:1}65%{opacity:1}100%{opacity:0;transform:translate(calc(-50% + var(--x)),calc(-50% + var(--y))) rotate(180deg) scale(.3)}}
   @media(pointer:coarse){.pet-level-star:nth-of-type(n+13){display:none}.pet-level-ring{box-shadow:none}.pet-level-crest{filter:none}}
   @media(prefers-reduced-motion:reduce){.pet-level-flash,.pet-level-rays,.pet-level-star,.pet-level-ring{display:none}.pet-level-message,.pet-level-shade,.pet-level-celebration{animation:none}}
  `}</style>
  <div className="pet-level-shade"/><div className="pet-level-flash"/><div className="pet-level-rays"/>
  {[0,.2,.4].map(delay=><div key={delay} className="pet-level-ring" style={{'--delay':`${delay}s`} as CSSProperties}/>)}
  {Array.from({length:24},(_,i)=><i key={i} className="pet-level-star" style={{'--x':`${Math.cos(i*Math.PI/12)*(170+i%3*70)}px`,'--y':`${Math.sin(i*Math.PI/12)*(170+i%3*70)}px`,'--delay':`${.1+i%4*.06}s`} as CSSProperties}/>)}
  <div className="pet-level-message"><img src={crest} className="pet-level-crest" alt=""/><span className="pet-level-title">LEVEL UP!</span><strong className="pet-level-number"><small>NEW LEVEL</small>{level}</strong></div>
 </div>;
}
