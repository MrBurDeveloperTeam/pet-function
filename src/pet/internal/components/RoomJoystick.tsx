import {useEffect,useRef,useState} from 'react';
export function RoomJoystick({onMove,disabled}:{onMove:(x:number,y:number)=>void;disabled:boolean}) {
 const pointer=useRef<number|null>(null),pad=useRef<HTMLDivElement>(null),origin=useRef({x:0,y:0});
 const petDrag=useRef(false),suppressClick=useRef(false);
 const blocked=useRef(disabled);blocked.current=disabled;
 const fade=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [center,setCenter]=useState<{x:number;y:number}|null>(null),[active,setActive]=useState(false);
 const [stick,setStick]=useState({x:0,y:0});
 const move=useRef(onMove);move.current=onMove;
 const stop=()=>{
  const id=pointer.current;pointer.current=null;
  const surface=pad.current?.parentElement;
  if(id!==null&&surface?.hasPointerCapture(id))surface.releasePointerCapture(id);
  setStick({x:0,y:0});move.current(0,0);setActive(false);
  if(fade.current)clearTimeout(fade.current);
  fade.current=setTimeout(()=>setCenter(null),650);
 };
 useEffect(()=>{if(disabled){stop();setCenter(null);}},[disabled]);
 const update=(x:number,y:number)=>{
  const dx=x-origin.current.x,dy=y-origin.current.y;
  const distance=Math.hypot(dx,dy),factor=Math.min(1,38/Math.max(1,distance));
  setStick({x:dx*factor,y:dy*factor});
  move.current(distance<9?0:dx/Math.max(38,distance),distance<9?0:dy/Math.max(38,distance));
 };
 useEffect(()=>{
  const surface=pad.current?.parentElement;if(!surface)return;
  const down=(e:PointerEvent)=>{
   if(blocked.current||pointer.current!==null||!['touch','pen'].includes(e.pointerType)||e.button!==0)return;
   const target=e.target instanceof Element?e.target:null;
   // Drag toys own the whole gesture; never capture their pointer for movement.
   if(target?.closest('[data-pet-joystick-exclude]')){suppressClick.current=false;return;}
   const onPet=!!target?.closest('[data-pet-joystick-ignore],[data-pet-interaction-action]');
   if(!target||(!onPet&&target.closest('button,a,input,textarea,select,[contenteditable="true"],[role="dialog"],[role="button"],[data-pet-movement-block],[data-pet-joystick-ignore]')))return;
   petDrag.current=onPet;suppressClick.current=false;if(!onPet){e.preventDefault();e.stopPropagation();}
   if(fade.current)clearTimeout(fade.current);
   const rect=surface.getBoundingClientRect();origin.current={x:e.clientX,y:e.clientY};pointer.current=e.pointerId;
   setCenter(onPet?null:{x:e.clientX-rect.left,y:e.clientY-rect.top});setActive(!onPet);setStick({x:0,y:0});move.current(0,0);
   if(!onPet)surface.setPointerCapture(e.pointerId);
  };
  const drag=(e:PointerEvent)=>{if(e.pointerId===pointer.current){if(petDrag.current){if(Math.hypot(e.clientX-origin.current.x,e.clientY-origin.current.y)<9)return;petDrag.current=false;suppressClick.current=true;const rect=surface.getBoundingClientRect();setCenter({x:origin.current.x-rect.left,y:origin.current.y-rect.top});setActive(true);surface.setPointerCapture(e.pointerId);}e.preventDefault();e.stopPropagation();update(e.clientX,e.clientY);}};
  const up=(e:PointerEvent)=>{if(e.pointerId===pointer.current)stop();};
  // Capture transfer from the cat bubbles a lost event; it is not a release.
  const lost=(e:PointerEvent)=>{if(e.target===surface&&e.pointerId===pointer.current&&!surface.hasPointerCapture(e.pointerId))stop();};
  const click=(e:MouseEvent)=>{if(suppressClick.current){e.preventDefault();e.stopPropagation();suppressClick.current=false;}};
  surface.addEventListener('click',click,true);
  const visibility=()=>{if(document.hidden)stop();};
  surface.addEventListener('pointerdown',down,true);window.addEventListener('pointermove',drag,{capture:true,passive:false});
  window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',up,true);surface.addEventListener('lostpointercapture',lost);
  window.addEventListener('blur',stop);document.addEventListener('visibilitychange',visibility);
  return()=>{
   surface.removeEventListener('click',click,true);
   surface.removeEventListener('pointerdown',down,true);window.removeEventListener('pointermove',drag,true);
   window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',up,true);surface.removeEventListener('lostpointercapture',lost);
   window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',visibility);
   if(fade.current)clearTimeout(fade.current);
   const id=pointer.current;pointer.current=null;
   if(id!==null&&surface.hasPointerCapture(id))surface.releasePointerCapture(id);
   move.current(0,0);
  };
 },[]);
 return <div ref={pad} style={{display:'contents'}}>{center&&!disabled&&<div role="group" aria-label="Move cat with directional joystick" data-pet-movement-block style={{position:'absolute',left:center.x,top:center.y,transform:'translate(-50%,-50%)',width:116,height:116,zIndex:55,borderRadius:'50%',border:'3px solid #c19a60',background:'#16383bbd',boxShadow:'inset 0 0 0 7px #092a3277,3px 4px 0 #271b1366',pointerEvents:'none',opacity:active?1:0,transition:active?'none':'opacity 650ms ease-out',userSelect:'none'}}>
  <span aria-hidden="true" style={{position:'absolute',inset:0,display:'grid',placeItems:'center',color:'#fff0b8',fontSize:24}}>✥</span>
  <span aria-hidden="true" style={{position:'absolute',left:33,top:33,width:44,height:44,borderRadius:'50%',border:'3px solid #ffe0a0',background:'linear-gradient(#ffeab2,#c9964c)',boxShadow:'0 4px 8px #061b2899',transform:`translate(${stick.x}px,${stick.y}px)`,pointerEvents:'none'}}/>
 </div>}</div>;
}
