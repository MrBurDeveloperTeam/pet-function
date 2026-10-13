import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';

type FullscreenDocument=Document & {webkitFullscreenEnabled?:boolean;webkitFullscreenElement?:Element;webkitExitFullscreen?:()=>void};
type FullscreenElement=HTMLElement & {webkitRequestFullscreen?:()=>void};
type Orientation=ScreenOrientation & {lock?:(mode:string)=>Promise<void>};
const isMobile=()=>/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)||matchMedia('(pointer: coarse)').matches;
const inFullscreen=()=>!!(document.fullscreenElement||(document as FullscreenDocument).webkitFullscreenElement||(navigator as Navigator & {standalone?:boolean}).standalone||matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches);

export function releasePetFullscreen(){
  if(document.documentElement.dataset.petFullscreenOwned!=='true')return;
  delete document.documentElement.dataset.petFullscreenOwned;
  screen.orientation?.unlock?.();
  if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});
  else (document as FullscreenDocument).webkitExitFullscreen?.();
}

/** Best effort across the entire pet visit; refusal or exiting never blocks play. */
export function usePetFullscreen(open:boolean){
  useEffect(()=>{
    if(!open||!isMobile())return;
    let attempted=false,closed=false;
    const enter=async()=>{
      if(attempted||inFullscreen())return;
      attempted=true;
      const target=document.documentElement as FullscreenElement;
      try{
        if(document.fullscreenEnabled&&target.requestFullscreen)await target.requestFullscreen({navigationUI:'hide'});
        else if((document as FullscreenDocument).webkitFullscreenEnabled&&target.webkitRequestFullscreen)await Promise.resolve(target.webkitRequestFullscreen());
        else return;
        document.documentElement.dataset.petFullscreenOwned='true';
        if(closed)releasePetFullscreen();
      }catch{/* Browser refusal must leave the cat and games usable. */}
    };
    // Capture the first real gesture even when a room/game overlay handles it.
    document.addEventListener('pointerup',enter,true);
    if(navigator.userActivation?.isActive)void enter();
    return()=>{closed=true;document.removeEventListener('pointerup',enter,true);releasePetFullscreen();};
  },[open]);
}

/** Room-only policy: native minigames retain their own orientation gates. */
export function useMobilePetScreenMode(active:boolean){
  const [state,setState]=useState({mobile:false,landscape:false,fullscreen:false});
  useEffect(()=>{
    const update=()=>setState({mobile:isMobile(),landscape:innerWidth>innerHeight,fullscreen:inFullscreen()});
    update();
    const query=matchMedia('(pointer: coarse)');
    query.addEventListener('change',update);
    window.addEventListener('resize',update);window.addEventListener('orientationchange',update);
    document.addEventListener('fullscreenchange',update);document.addEventListener('webkitfullscreenchange',update);
    return()=>{query.removeEventListener('change',update);window.removeEventListener('resize',update);window.removeEventListener('orientationchange',update);document.removeEventListener('fullscreenchange',update);document.removeEventListener('webkitfullscreenchange',update);};
  },[]);
  useEffect(()=>{
    if(!active||!state.mobile||!state.fullscreen)return;
    const orientation=screen.orientation as Orientation;
    let cancelled=false;
    // Release a late lock too, if a game opens while this promise is pending.
    void orientation?.lock?.('portrait').then(()=>{if(cancelled)orientation.unlock();}).catch(()=>{});
    return()=>{cancelled=true;orientation?.unlock?.();};
  },[active,state.mobile,state.fullscreen]);
  const blocked=active&&state.mobile&&state.landscape;
  useEffect(()=>{
    if(!blocked)return;
    const stop=(event:KeyboardEvent)=>{if(event.key!=='Tab'){event.preventDefault();event.stopImmediatePropagation();}};
    window.addEventListener('keydown',stop,true);
    return()=>window.removeEventListener('keydown',stop,true);
  },[blocked]);
  const gate=blocked&&createPortal(<div className="pet-room-screen-block" data-pet-room-screen-block data-pet-movement-block role="dialog" aria-modal="true" aria-label="Rotate to portrait">
    <div className="pet-room-screen-card">
      <div className="pet-room-screen-icon" aria-hidden="true">📱 ↻</div>
      <h2>Rotate to portrait</h2>
      <p>Turn your device upright to continue playing with your cat.</p>
    </div>
  </div>,document.body);
  return {blocked,gate};
}
