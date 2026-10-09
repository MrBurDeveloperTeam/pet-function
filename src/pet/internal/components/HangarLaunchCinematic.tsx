import {useEffect,useRef,type ReactNode} from 'react';

const DURATION=8400;

/** Called directly from the Start button so browsers can unlock audio. */
export function startHangarLaunchSound():()=>void {
 let context:AudioContext;
 try{context=new AudioContext();void context.resume().catch(()=>{});}catch{return()=>{};}
 const master=context.createGain();master.gain.value=.22;master.connect(context.destination);
 const now=context.currentTime;
 const noise=context.createBuffer(1,context.sampleRate*2,context.sampleRate);
 const samples=noise.getChannelData(0);
 for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
 const rumble=(start:number,length:number,from:number,to:number,volume:number)=>{
  const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
  source.buffer=noise;source.loop=true;filter.type='lowpass';filter.Q.value=.7;
  filter.frequency.setValueAtTime(from,now+start);filter.frequency.exponentialRampToValueAtTime(to,now+start+length);
  gain.gain.setValueAtTime(0,now+start);gain.gain.linearRampToValueAtTime(volume,now+start+.18);gain.gain.setValueAtTime(volume,now+start+length-.3);gain.gain.linearRampToValueAtTime(0,now+start+length);
  source.connect(filter);filter.connect(gain);gain.connect(master);source.start(now+start);source.stop(now+start+length);
 };
 const tone=(start:number,length:number,from:number,to:number,volume:number)=>{
  const source=context.createOscillator(),gain=context.createGain();source.type='sine';
  source.frequency.setValueAtTime(from,now+start);source.frequency.exponentialRampToValueAtTime(to,now+start+length);
  gain.gain.setValueAtTime(0,now+start);gain.gain.linearRampToValueAtTime(volume,now+start+.08);gain.gain.exponentialRampToValueAtTime(.001,now+start+length);
  source.connect(gain);gain.connect(master);source.start(now+start);source.stop(now+start+length);
 };
 // Door hydraulics, locking bolts, turbine spin-up, then the departing jet.
 rumble(1.15,2.5,150,480,.45);tone(1.2,.4,95,42,.65);tone(3.45,.35,70,35,.5);
 rumble(3.1,4.6,100,1800,.65);tone(3.1,4.3,65,440,.3);tone(3.3,3.8,120,720,.13);
 rumble(5.2,2.5,2400,130,.9);tone(5.25,1.8,230,48,.3);
 let stopped=false;
 return()=>{if(!stopped){stopped=true;void context.close().catch(()=>{});}};
}

export function HangarLaunchCinematic({scene,aircraft,onComplete}:{scene:{width:number;height:number};aircraft:ReactNode;onComplete:()=>void}) {
 const world=useRef<HTMLDivElement>(null),plane=useRef<HTMLDivElement>(null),shade=useRef<HTMLDivElement>(null),camera=useRef<HTMLDivElement>(null);
 const completed=useRef(onComplete);completed.current=onComplete;
 useEffect(()=>{
  const height=world.current!.getBoundingClientRect().height;
  const animations:Animation[]=[];
  const play=(element:Element,keyframes:Keyframe[],options:KeyframeAnimationOptions)=>{const animation=element.animate(keyframes,options);animations.push(animation);return animation;};
  // Black bridges both scene changes; the clean hangar is revealed in between.
  const fade=play(shade.current!,[{opacity:0},{opacity:1,offset:.07},{opacity:1,offset:.11},{opacity:0,offset:.21},{opacity:0,offset:.88},{opacity:1}],{duration:DURATION,fill:'forwards'});
  world.current!.querySelectorAll<HTMLElement>('.sky-launch-door').forEach((door,i)=>play(door,[{transform:'translateX(0)'},{transform:`translateX(${i===0?-102:102}%)`}],{delay:1200,duration:2300,easing:'cubic-bezier(.45,0,.25,1)',fill:'forwards'}));
  world.current!.querySelectorAll<HTMLElement>('.sky-hangar-clamp').forEach((clamp,i)=>play(clamp,[{transform:'translateX(0)'},{transform:`translateX(${i===0?-160:160}%)`}],{delay:3100,duration:700,easing:'ease-in-out',fill:'forwards'}));
  play(plane.current!,[
   {transform:'translateY(0) scale(1)'},
   {transform:'translateY(0) scale(1)',offset:.42},
   {transform:`translateY(${-height*.018}px) scale(1.015)`,offset:.55},
   {transform:`translateY(${-height*.04}px) scale(1)`,offset:.63,easing:'cubic-bezier(.6,0,.85,.45)'},
   {transform:`translateY(${-height*1.05}px) scale(.32)`,offset:.9},
   {transform:`translateY(${-height*1.2}px) scale(.25)`}
  ],{duration:DURATION,fill:'forwards'});
  const shakes=Array.from({length:32},(_,i)=>({transform:`translate(${Math.sin(i*2.7)*(i<16?1.5:3)}px,${Math.cos(i*3.7)*(i<16?1:2.5)}px) scale(1.015)`}));
  shakes.push({transform:'translate(0,0) scale(1.015)'});
  play(camera.current!,shakes,{delay:3150,duration:4100,fill:'forwards'});
  let cancelled=false;void fade.finished.then(()=>{if(!cancelled)completed.current();}).catch(()=>{});
  const block=(event:KeyboardEvent)=>{event.preventDefault();event.stopImmediatePropagation();};
  window.addEventListener('keydown',block,true);
  return()=>{cancelled=true;animations.forEach(animation=>animation.cancel());window.removeEventListener('keydown',block,true);};
 },[]);
 return <div className="sky-launch-cinematic" role="status" aria-label="Aircraft launching from the hangar">
  <style>{`
   .sky-launch-cinematic{position:absolute;inset:0;z-index:30;overflow:hidden;background:#050d12;pointer-events:auto}
   .sky-launch-camera{position:absolute;inset:0;transform-origin:50% 35%}
   .sky-launch-cinematic .sky-hangar-world:before{z-index:1}
   .sky-launch-cinematic .sky-hangar-display{z-index:3}
   .sky-launch-aircraft{position:absolute;inset:0;will-change:transform}
   .sky-launch-aircraft .sky-hangar-plane{z-index:2}
   .sky-launch-gate{position:absolute;left:29%;width:42%;top:0;height:25%;overflow:hidden;z-index:2}
   .sky-launch-gate:after{content:'';position:absolute;inset:0;box-shadow:inset 0 0 25px 10px #071923;pointer-events:none}
   .sky-launch-door{position:absolute;top:0;bottom:0;width:50%;background-image:url(/games/air-strike/hangar-rankings.png);background-size:476.19% 400%;background-repeat:no-repeat;will-change:transform;box-shadow:8px 0 18px #0009}
   .sky-launch-door.left{left:0;background-position:36.7089% 0}.sky-launch-door.right{right:0;background-position:63.2911% 0}
   .sky-launch-door:after{content:"";position:absolute;top:0;bottom:0;width:3px;background:#b48f4c;box-shadow:0 0 9px #e6ba5b55}
   .sky-launch-door.left:after{right:0}.sky-launch-door.right:after{left:0}
   .sky-launch-daylight{position:absolute;left:22%;top:8%;width:56%;height:67%;background:linear-gradient(#c5f8ff66,transparent);clip-path:polygon(25% 0,75% 0,100% 100%,0 100%);opacity:0;animation:sky-launch-light 8.4s linear both;mix-blend-mode:screen;z-index:2;pointer-events:none}
   .sky-launch-flame{position:absolute;top:82%;width:17%;height:60%;background:radial-gradient(ellipse at 50% 8%,#fffce7 0%,#a9f5ff 12%,#37b8e9 27%,#235ab855 48%,transparent 70%);filter:url(#sky-exhaust-warp) drop-shadow(0 0 9px #70dcff);transform-origin:50% 0;opacity:0;animation:sky-launch-ignite 8.4s linear both;z-index:1}
   .sky-launch-flame.left{left:29%}.sky-launch-flame.right{right:29%}
   .sky-launch-flame:after{content:"";position:absolute;inset:4% 32% 25%;background:repeating-radial-gradient(ellipse at 50% 0,#fffbdc 0 5%,#a1eaffbb 9%,transparent 16%);filter:blur(1px);animation:sky-launch-flicker .12s infinite alternate}
   .sky-launch-dust{position:absolute;left:50%;top:59%;width:34px;height:16px;background:radial-gradient(ellipse,#8ca1a64d,transparent 70%);filter:url(#sky-exhaust-warp);opacity:0;animation:sky-launch-dust 2.1s var(--delay) ease-out infinite;--dx:0px}
   .sky-launch-floor-glow{position:absolute;left:31%;top:43%;width:38%;height:49%;background:radial-gradient(ellipse,#7ae9ff66,transparent 65%);mix-blend-mode:screen;animation:sky-launch-ignite 8.4s linear both;z-index:2}.sky-launch-warning{position:absolute;top:19%;width:7%;height:15%;background:radial-gradient(ellipse,#ffaf3255,transparent 70%);mix-blend-mode:screen;animation:sky-launch-warning 1.2s ease-in-out infinite}.sky-launch-warning.left{left:25%}.sky-launch-warning.right{right:25%}@keyframes sky-launch-warning{50%{opacity:.15}}
   .sky-launch-shade{position:absolute;inset:0;background:#000;z-index:9;pointer-events:none}
   .sky-launch-vignette{position:absolute;inset:0;z-index:7;box-shadow:inset 0 0 12vw #0009;pointer-events:none}
   @keyframes sky-launch-light{0%,17%{opacity:0}44%,85%{opacity:1}100%{opacity:0}}
   @keyframes sky-launch-ignite{0%,38%{opacity:0;transform:scaleY(.05)}43%{opacity:.6;transform:scaleY(.3)}61%{opacity:1;transform:scaleY(.7)}66%,100%{opacity:1;transform:scaleY(1.4)}}
   @keyframes sky-launch-flicker{to{transform:scaleX(.72) scaleY(.88)}}
   @keyframes sky-launch-dust{0%{opacity:0;transform:translate(0,0) scale(1)}15%{opacity:.65}100%{opacity:0;transform:translate(var(--dx),220px) scale(4)}}
  `}</style>
  <svg width="0" height="0" aria-hidden="true" style={{position:"absolute"}}><defs><filter id="sky-exhaust-warp" x="-50%" y="-30%" width="200%" height="160%"><feTurbulence type="fractalNoise" baseFrequency=".035 .12" numOctaves="3" seed="7" result="noise"><animate attributeName="baseFrequency" values=".035 .12;.045 .18;.035 .12" dur=".7s" repeatCount="indefinite"/></feTurbulence><feDisplacementMap in="SourceGraphic" in2="noise" scale="18"/></filter></defs></svg>
  <div className="sky-launch-camera" ref={camera}>
   <div ref={world} className="sky-hangar-world" style={{...scene,backgroundImage:"url(/games/air-strike/hangar-launch-open.png)"}}>
    <div className="sky-launch-gate"><div className="sky-launch-door left"/><div className="sky-launch-door right"/></div>
    <div className="sky-launch-daylight"/><div className="sky-launch-floor-glow"/><div className="sky-launch-warning left"/><div className="sky-launch-warning right"/>
    <div className="sky-hangar-display">
     <div className="sky-hangar-platform"/>
     <div ref={plane} className="sky-launch-aircraft">{aircraft}<i className="sky-launch-flame left"/><i className="sky-launch-flame right"/></div>
     
    </div>
    {Array.from({length:22},(_,i)=><i key={i} className="sky-launch-dust" style={{'--dx':`${(i-10.5)*24}px`,'--delay':`${3.5+i*.055}s`} as React.CSSProperties}/>)}
   </div>
  </div>
  <div className="sky-launch-vignette"/><div className="sky-launch-shade" ref={shade}/>
 </div>;
}
