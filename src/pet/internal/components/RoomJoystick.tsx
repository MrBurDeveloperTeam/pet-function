import {useEffect,useRef,useState} from 'react';
export function RoomJoystick({onMove,disabled}:{onMove:(x:number,y:number)=>void;disabled:boolean}) {
 const pointer=useRef<number|null>(null),pad=useRef<HTMLDivElement>(null);
 const [stick,setStick]=useState({x:0,y:0});
 const move=useRef(onMove);move.current=onMove;
 const stop=()=>{pointer.current=null;setStick({x:0,y:0});move.current(0,0);};
 useEffect(()=>{if(disabled)stop();},[disabled]);
 useEffect(()=>{window.addEventListener('blur',stop);return()=>{window.removeEventListener('blur',stop);move.current(0,0);};},[]);
 const update=(x:number,y:number)=>{
  const rect=pad.current!.getBoundingClientRect();
  const dx=x-rect.left-rect.width/2,dy=y-rect.top-rect.height/2;
  const distance=Math.hypot(dx,dy),factor=Math.min(1,38/Math.max(1,distance));
  setStick({x:dx*factor,y:dy*factor});
  move.current(distance<9?0:dx/Math.max(38,distance),distance<9?0:dy/Math.max(38,distance));
 };
 return <div ref={pad} role="group" aria-label="Move cat with directional joystick" data-pet-movement-block style={{position:'absolute',left:'max(18px,env(safe-area-inset-left))',bottom:'max(18px,env(safe-area-inset-bottom))',width:116,height:116,zIndex:55,borderRadius:'50%',border:'3px solid #c19a60',background:'#16383bbd',boxShadow:'inset 0 0 0 7px #092a3277,3px 4px 0 #271b1366',touchAction:'none',opacity:disabled?.35:1,visibility:disabled?'hidden':'visible',userSelect:'none'}}
  onPointerDown={e=>{e.stopPropagation();if(disabled||pointer.current!==null)return;e.preventDefault();pointer.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);update(e.clientX,e.clientY);}}
  onPointerMove={e=>{e.stopPropagation();if(pointer.current===e.pointerId)update(e.clientX,e.clientY);}}
  onPointerUp={e=>{e.stopPropagation();if(pointer.current===e.pointerId)stop();}} onPointerCancel={stop} onLostPointerCapture={stop}>
  <span aria-hidden="true" style={{position:'absolute',inset:0,display:'grid',placeItems:'center',color:'#fff0b8',fontSize:24}}>✥</span>
  <span aria-hidden="true" style={{position:'absolute',left:33,top:33,width:44,height:44,borderRadius:'50%',border:'3px solid #ffe0a0',background:'linear-gradient(#ffeab2,#c9964c)',boxShadow:'0 4px 8px #061b2899',transform:`translate(${stick.x}px,${stick.y}px)`,pointerEvents:'none'}}/>
 </div>;
}
