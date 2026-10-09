import {useEffect,useRef} from 'react';

const DURATION=7600;
const RIFT='M78 9C96 19 103 4 119 27S150 31 141 56S160 77 141 95S145 131 116 132S95 156 73 143S39 153 35 125S8 112 18 85S2 56 25 43S35 14 58 21S65 1 78 9Z';

/** Keep the player's cat appearance and use its directional running sprite row. */
export function ArcadePortalTransition({pet,onComplete}:{pet:HTMLDivElement;onComplete:()=>void}){
 const overlay=useRef<HTMLDivElement>(null),traveller=useRef<HTMLDivElement>(null),portal=useRef<HTMLDivElement>(null);
 const done=useRef(onComplete);done.current=onComplete;
 useEffect(()=>{
  const host=overlay.current!,cat=traveller.current!,gate=portal.current!;
  const scene=pet.closest('[data-pet-room]')||pet.closest('.pet-room')||document.querySelector('[data-room-background="scene"]')?.parentElement;
  const bounds=scene?.getBoundingClientRect()||document.documentElement.getBoundingClientRect();
  const scale=Math.max(bounds.width/1862,bounds.height/845);
  const target={x:bounds.left+(bounds.width-1862*scale)/2+759*scale,y:bounds.top+(bounds.height-845*scale)/2+291*scale};
  const rect=pet.getBoundingClientRect();
  const clone=pet.cloneNode(true) as HTMLDivElement;
  const originals=[pet,...pet.querySelectorAll<HTMLElement>('*')];
  const copies=[clone,...clone.querySelectorAll<HTMLElement>('*')];
  originals.forEach((element,index)=>{
   const computed=getComputedStyle(element),copy=copies[index];
   for(const property of computed)copy.style.setProperty(property,computed.getPropertyValue(property));
   copy.style.animation='none';copy.style.transition='none';copy.removeAttribute('id');
  });
  clone.style.margin='0';cat.appendChild(clone);
  Object.assign(cat.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
  Object.assign(gate.style,{left:`${target.x}px`,top:`${target.y}px`,width:`${108*scale}px`,height:`${108*scale}px`});
  const oldVisibility=pet.style.visibility;pet.style.visibility='hidden';
  const blockKeys=(event:KeyboardEvent)=>{event.preventDefault();event.stopImmediatePropagation();};
  window.addEventListener('keydown',blockKeys,true);
  const dx=target.x-rect.left-rect.width/2,dy=target.y-rect.top-rect.height/2;
  const sprite=clone.querySelector<HTMLElement>('.mallow-virtual-pet');
  const row=dx<0?2:1;
  const flightAngle=(Math.atan2(dy,dx)*180/Math.PI)-(dx<0?-180:0);
  const animations=[
   host.animate([{background:'rgba(0,0,0,0)'},{background:'rgba(0,3,12,.94)',offset:.08},{background:'rgba(0,5,18,.62)',offset:.24},{background:'rgba(0,5,18,.62)',offset:.91},{background:'#000'}],{duration:DURATION,fill:'forwards'}),
   gate.animate([{opacity:0,transform:'translate(-50%,-50%) scale(.05)'},{opacity:0,transform:'translate(-50%,-50%) scale(.05)',offset:.1},{opacity:.5,transform:'translate(-50%,-50%) scale(.6)',offset:.19},{opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.3},{opacity:1,transform:'translate(-50%,-50%) scale(1.12)',offset:.85},{opacity:0,transform:'translate(-50%,-50%) scale(.03)'}],{duration:DURATION,fill:'forwards'}),
   cat.animate([
    {transform:'translate(0,0) scale(1)',opacity:1},
    {transform:'translate(0,0) scale(1)',opacity:.15,offset:.08},
    {transform:'translate(0,0) scale(1)',opacity:1,offset:.24},
    {transform:'translate(0,0) scale(1)',opacity:1,offset:3500/DURATION},
    {transform:`translate(${dx*.12}px,${dy*.04}px) rotate(${flightAngle*.12}deg) scale(.98)`,opacity:1,offset:.55},
    {transform:`translate(${dx*.38}px,${dy*.23}px) rotate(${flightAngle*.45}deg) scale(.8)`,opacity:1,offset:.66},
    {transform:`translate(${dx*.74}px,${dy*.62}px) rotate(${flightAngle*.85}deg) scale(.45)`,opacity:1,offset:.77},
    {transform:`translate(${dx}px,${dy}px) rotate(${flightAngle}deg) scale(.02)`,opacity:0,offset:.88},
    {transform:`translate(${dx}px,${dy}px) scale(0)`,opacity:0}
   ],{duration:DURATION,easing:'linear',fill:'forwards'})
  ];
  // Hold a sideways gaze before the suction starts; animate legs during flight.
  const timers=[window.setTimeout(()=>{
   if(sprite){
    const front=sprite.cloneNode(true) as HTMLElement;
    sprite.parentElement?.appendChild(front);
    // The second side-facing frame is upright: pause to notice the portal.
    sprite.style.backgroundPosition=`-192px -${row*208}px`;
    const turn=front.animate([{opacity:1},{opacity:0}],{duration:260,fill:'forwards'});
    animations.push(turn,sprite.animate([{opacity:0},{opacity:1}],{duration:260,fill:'forwards'}));
    void turn.finished.then(()=>front.remove()).catch(()=>{});
   }
   cat.dataset.phase='looking';
  },2300),window.setTimeout(()=>{
   cat.dataset.phase='running';
   if(sprite)animations.push(sprite.animate([{backgroundPosition:`0px -${row*208}px`},{backgroundPosition:`-1536px -${row*208}px`}],{duration:560,iterations:Infinity,easing:'steps(8,end)'}));
  },3500)];
  let cancelled=false;void animations[0].finished.then(()=>{if(!cancelled)done.current();}).catch(()=>{});
  return()=>{cancelled=true;timers.forEach(clearTimeout);animations.forEach(a=>a.cancel());window.removeEventListener('keydown',blockKeys,true);pet.style.visibility=oldVisibility;clone.remove();};
 },[pet]);
 return <div ref={overlay} role="status" aria-label="Entering Sky Patrol through the arcade portal" style={{position:'fixed',inset:0,zIndex:1000,overflow:'hidden',pointerEvents:'auto'}} onKeyDown={e=>{e.preventDefault();e.stopPropagation();}} onPointerDown={e=>e.stopPropagation()}>
  <style>{`
   @keyframes arcade-rift-flow{to{transform:rotate(360deg)}}
   @keyframes arcade-rift-light{0%,100%{opacity:.5;transform:scale(.95)}50%{opacity:.85;transform:scale(1.1)}}
   @keyframes arcade-rift-particle{0%{transform:rotate(var(--angle)) translateX(145px) scale(1);opacity:0}20%{opacity:.9}100%{transform:rotate(calc(var(--angle) + 65deg)) translateX(0) scale(.1);opacity:0}}
   .arcade-rift-art{position:absolute;inset:-12%;width:124%;height:124%;overflow:visible;filter:drop-shadow(0 0 6px #68e9ff) drop-shadow(0 0 18px #006aff)}
   .arcade-rift-light{position:absolute;inset:-110%;background:radial-gradient(ellipse,#67cfff40,transparent 64%);animation:arcade-rift-light 1.7s ease-in-out infinite}
   .arcade-rift-filaments{transform-origin:80px 80px;animation:arcade-rift-flow 3.6s linear infinite}
   .arcade-rift-particle{position:absolute;left:50%;top:50%;width:17px;height:2px;border-radius:100%;background:linear-gradient(90deg,transparent,#b9faff);box-shadow:0 0 7px #27bbff;animation:arcade-rift-particle 1.8s linear infinite}
  `}</style>
  <div ref={portal} style={{position:'absolute',opacity:0}}>
   <div className="arcade-rift-light"/>
   {Array.from({length:24},(_,i)=><i key={i} className="arcade-rift-particle" style={{'--angle':`${i*137.5}deg`,animationDelay:`-${i*.13}s`,animationDuration:`${1.4+i%5*.18}s`} as React.CSSProperties}/>)}
   <svg className="arcade-rift-art" viewBox="0 0 160 160" aria-hidden="true">
    <defs>
     <radialGradient id="arcade-rift-depth"><stop stopColor="#00010b"/><stop offset=".4" stopColor="#02091b"/><stop offset=".72" stopColor="#063985"/><stop offset=".91" stopColor="#1589dc"/><stop offset="1" stopColor="#9cf8ff"/></radialGradient>
     <filter id="arcade-rift-warp" x="-40%" y="-40%" width="180%" height="180%"><feTurbulence type="fractalNoise" baseFrequency=".026" numOctaves="2" seed="8" result="noise"><animate attributeName="baseFrequency" values=".026;.038;.026" dur="3s" repeatCount="indefinite"/></feTurbulence><feDisplacementMap in="SourceGraphic" in2="noise" scale="13"/></filter>
     <clipPath id="arcade-rift-mask"><path d={RIFT}/></clipPath>
    </defs>
    <g filter="url(#arcade-rift-warp)">
     <path d={RIFT} fill="url(#arcade-rift-depth)" stroke="#26b1ff" strokeWidth="7" strokeOpacity=".25"/>
     <path d={RIFT} fill="none" stroke="#c1ffff" strokeWidth="1.7"/>
     <g clipPath="url(#arcade-rift-mask)"><g className="arcade-rift-filaments">{Array.from({length:7},(_,i)=><path key={i} transform={`rotate(${i*51.4} 80 80)`} d="M81 79C53 93 40 73 43 50S76 3 112 12C148 21 156 54 142 78" stroke={i%2?'#219fff':'#81e8ff'} strokeOpacity={.3+i%3*.2} strokeWidth={1+i%3} fill="none"/>)}</g></g>
     <path d="M68 66C76 54 93 61 97 73S90 95 77 93S58 78 68 66" fill="#000511"/>
    </g>
    <g stroke="#c9fcff" strokeWidth="1.2" fill="none" opacity=".8"><path d="M37 24L29 36L38 39L26 52M125 29L136 40L131 48L146 61M26 103L37 108L29 122L44 130M108 137L119 125L126 130L138 114"/></g>
   </svg>
  </div>
  <div ref={traveller} data-phase="waiting" style={{position:'absolute',transformOrigin:'center',filter:'drop-shadow(0 0 8px #56caff88)',pointerEvents:'none'}}/>
 </div>;
}
