import {useEffect,useRef} from 'react';

export function PetLevelUpCelebration({level,onDone}:{level:number;onDone:()=>void}) {
 const finish=useRef(onDone);finish.current=onDone;
 useEffect(()=>{
  let context:AudioContext|undefined;
  try {
   context=new AudioContext();void context.resume().catch(()=>{});
   const gain=context.createGain();gain.gain.value=.09;gain.connect(context.destination);
   [523.25,659.25,783.99,1046.5].forEach((frequency,i)=>{
    const tone=context!.createOscillator(),volume=context!.createGain();
    const start=context!.currentTime+i*.11;
    tone.type='sine';tone.frequency.value=frequency;
    volume.gain.setValueAtTime(0,start);volume.gain.linearRampToValueAtTime(1,start+.015);volume.gain.exponentialRampToValueAtTime(.001,start+.45);
    tone.connect(volume);volume.connect(gain);tone.start(start);tone.stop(start+.5);
   });
  }catch{ /* Visual feedback remains available without browser audio. */ }
  const timer=window.setTimeout(()=>finish.current(),1800);
  return()=>{clearTimeout(timer);if(context)void context.close().catch(()=>{});};
 },[]);
 return <div className="pet-level-celebration" role="status" aria-live="polite">
  <style>{`
   .pet-level-celebration{position:fixed;inset:0;z-index:1500;pointer-events:none;display:grid;place-items:center;overflow:hidden;isolation:isolate}
   .pet-level-halo{position:absolute;width:min(65vw,600px);aspect-ratio:1;background:radial-gradient(circle,#f6c85d44,transparent 65%);animation:petLevelHalo 1.8s ease-out both}
   .pet-level-rays{position:absolute;width:380px;height:380px;background:repeating-conic-gradient(from 0deg,#f7d88455 0deg 2deg,transparent 2deg 30deg);mask-image:radial-gradient(circle,transparent 28%,#000 36%,transparent 70%);animation:petLevelHalo 1.8s ease-out both}
   .pet-level-star{position:absolute;left:50%;top:50%;width:20px;height:20px;background:#ffe791;clip-path:polygon(50% 0,61% 35%,100% 39%,71% 62%,80% 100%,50% 78%,20% 100%,29% 62%,0 39%,39% 35%);animation:petLevelStar 1.4s var(--delay) ease-out both}
   .pet-level-message{position:relative;text-align:center;background:linear-gradient(120deg,#183e45ee,#09202aee);border:2px solid #f4cf79;padding:22px 34px;color:#fff1b6;box-shadow:0 0 45px #efcb5744,4px 4px 0 #081b24;animation:petLevelMessage 1.8s ease-out both;font-family:system-ui,sans-serif}
   .pet-level-message span{display:block;font-weight:900;letter-spacing:.15em;font-size:clamp(20px,3vw,32px)}.pet-level-message strong{display:block;font-size:clamp(28px,4vw,46px);color:#a5f6df;margin-top:8px}
   @keyframes petLevelMessage{0%{opacity:0;transform:scale(.6)}15%{opacity:1;transform:scale(1.08)}25%,75%{opacity:1;transform:scale(1)}100%{opacity:0;transform:translateY(-15px) scale(.98)}}
   @keyframes petLevelHalo{0%{opacity:0;transform:scale(.35) rotate(-10deg)}20%{opacity:1}100%{opacity:0;transform:scale(1.2) rotate(12deg)}}
   @keyframes petLevelStar{0%{opacity:0;transform:translate(-50%,-50%) scale(.3)}15%{opacity:1}100%{opacity:0;transform:translate(calc(-50% + var(--x)),calc(-50% + var(--y))) rotate(130deg) scale(.5)}}
   @media(prefers-reduced-motion:reduce){.pet-level-halo,.pet-level-rays,.pet-level-star{display:none}.pet-level-message{animation:none}}
  `}</style>
  <div className="pet-level-halo"/><div className="pet-level-rays"/>
  {Array.from({length:16},(_,i)=><i key={i} className="pet-level-star" style={{'--x':`${Math.cos(i*Math.PI/8)*(150+i%3*35)}px`,'--y':`${Math.sin(i*Math.PI/8)*(130+i%3*35)}px`,'--delay':`${i%4*.055}s`} as React.CSSProperties}/>)}
  <div className="pet-level-message"><span>LEVEL UP!</span><strong>LV {level}</strong></div>
 </div>;
}
