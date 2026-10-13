import {useEffect,useRef,useState,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {loadReviveVideos,type ReviveVideo} from '../reviveVideoCatalog';
import {useMobileLandscapePaused} from './MobileLandscapeGate';
import {REVIVE_COSTS,addWatchedTime} from '../reviveRules.mjs';

let youtubeReady:Promise<any>|null=null;
function youtube(){
  if((window as any).YT?.Player)return Promise.resolve((window as any).YT);
  return youtubeReady ||= new Promise((resolve,reject)=>{
    const previous=(window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady=()=>{previous?.();resolve((window as any).YT);};
    const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=()=>{youtubeReady=null;reject(Error('Video player unavailable'));};document.head.appendChild(script);
  });
}
type Offer={runId:string|number;used:number};
export function GameRevival({iframe,source,coins,spendCoins}:{iframe:RefObject<HTMLIFrameElement|null>;source:string;coins:number;spendCoins:(amount:number)=>Promise<unknown>}){
  const [offer,setOffer]=useState<Offer|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[video,setVideo]=useState<ReviveVideo|null>(null),[watched,setWatched]=useState(0),[pending,setPending]=useState<boolean|null>(null);
  const lock=useRef(false),container=useRef<HTMLDivElement>(null),player=useRef<any>(null),watch=useRef(0);
  const activeOffer=useRef<Offer|null>(null),ackTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  activeOffer.current=offer;
  const paused=useMobileLandscapePaused();
  const playbackAllowed=useRef(true);playbackAllowed.current=!paused&&pending===null;
  useEffect(()=>{
    const receive=(event:MessageEvent)=>{
      const data=event.data;
      if(event.origin===location.origin&&event.source===iframe.current?.contentWindow&&data?.source==='pet-function:revive-ack'&&String(data.runId)===String(activeOffer.current?.runId)){
        if(ackTimer.current)clearTimeout(ackTimer.current);setOffer(null);setVideo(null);setPending(null);setBusy(false);lock.current=false;iframe.current?.contentWindow?.focus();return;
      }
      if(event.origin!==location.origin||event.source!==iframe.current?.contentWindow||data?.source!==source||data.type!=='REVIVE_OFFER'||!Number.isInteger(data.used)||data.used<0||data.used>=3||!['string','number'].includes(typeof data.runId))return;
      lock.current=false;setBusy(false);setPending(null);setError('');setVideo(null);watch.current=0;setWatched(0);setOffer({runId:data.runId,used:data.used});
    };
    window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);
  },[iframe,source]);
  const answer=(approved:boolean)=>{
    if(!offer)return;
    player.current?.pauseVideo();setPending(approved);setBusy(true);lock.current=true;setError('');
    iframe.current?.contentWindow?.postMessage({source:'pet-function:revive',runId:offer.runId,approved},location.origin);
    if(ackTimer.current)clearTimeout(ackTimer.current);
    ackTimer.current=setTimeout(()=>{setBusy(false);setError('The game has not confirmed yet. Retry below; you will not be charged again.');},3000);
  };
  useEffect(()=>()=>{if(ackTimer.current)clearTimeout(ackTimer.current);},[]);
  useEffect(()=>{
    if(!video||!container.current)return;
    let stopped=false,instance:any,lastTime=0,lastWall=performance.now();
    const timeout=setTimeout(()=>{if(!instance?.getPlayerState?.()){setVideo(null);setError('Video could not load. Please choose a revival option again.');}},15000);
    void youtube().then(YT=>{
      if(stopped)return;
      const mount=document.createElement('div');container.current?.replaceChildren(mount);
      instance=new YT.Player(mount,{videoId:video.video_id,width:'100%',height:'100%',playerVars:{autoplay:1,controls:0,disablekb:1,playsinline:1,origin:location.origin,rel:0},events:{onReady:()=>{player.current=instance;clearTimeout(timeout);instance.playVideo();setTimeout(()=>{if(!stopped&&instance.getPlayerState()!==1&&playbackAllowed.current){instance.mute();instance.playVideo();}},1200);},onError:()=>{setVideo(null);setError('Sponsor video unavailable. Please choose another revival option.');},onStateChange:(event:any)=>{lastTime=instance.getCurrentTime();lastWall=performance.now();if(event.data===0&&watch.current<30){instance.seekTo(0);instance.playVideo();}}}});
    }).catch(()=>setError('Unable to load the video player. Please retry.'));
    const timer=setInterval(()=>{
      if(!instance?.getCurrentTime)return;
      const current=instance.getCurrentTime(),now=performance.now(),delta=current-lastTime,wall=(now-lastWall)/1000;
      watch.current=addWatchedTime(watch.current,delta,wall,instance.getPlayerState()===1,document.visibilityState==='visible'&&playbackAllowed.current);setWatched(watch.current);
      if(document.hidden||!playbackAllowed.current)instance.pauseVideo();
      else if(instance.getPlayerState()===2&&activeOffer.current&&watch.current<30)instance.playVideo();
      lastTime=current;lastWall=now;
    },250);
    return()=>{stopped=true;clearTimeout(timeout);clearInterval(timer);instance?.destroy();player.current=null;};
  },[video]);
  useEffect(()=>{if(paused)player.current?.pauseVideo();},[paused]);
  if(!offer)return null;
  const theme=source==='air-strike'?'air-strike':'stadium-hurdles';
  const cost=REVIVE_COSTS[offer.used];
  const pay=async()=>{
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{const result=await spendCoins(cost);if(result===false)throw Error('Insufficient coins');answer(true);}catch{setError('Payment failed or insufficient coins. No revival used.');lock.current=false;setBusy(false);}
  };
  const advert=async()=>{
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{const videos=await loadReviveVideos();const choices=videos.filter(v=>v.video_id!==video?.video_id);if(!choices.length)throw Error();watch.current=0;setWatched(0);setVideo(choices[Math.floor(Math.random()*choices.length)]);}catch{setError('No playable sponsor video available. Please retry or use coins.');}finally{lock.current=false;setBusy(false);}
  };
  return createPortal(<div className="pet-revive-shade" data-pet-movement-block><section className={`pet-revive-panel ${video?'has-video':`is-illustrated theme-${theme}`}`} style={video?undefined:{background:'none',boxShadow:'none',border:0,borderRadius:0}} role="dialog" aria-modal="true" aria-label="Revive">
    {!video&&<img className="pet-revive-frame" src={`/games/${theme}/revive-frame-v1.webp`} alt="" draggable={false}/>}
    <div className="pet-revive-content">
    <header><span className="pet-revive-kicker">{video?'SPONSOR BREAK':'SECOND CHANCE'}</span><h2>{video?'Watch. Return. Keep going.':theme==='air-strike'?'Ready to fly again?':'Back in the race?'}</h2><div className="pet-revive-lives">{[0,1,2].map(i=><i key={i} className={i<offer.used?'used':''}/>)}<span>{3-offer.used} / 3 revivals left</span></div></header>
    {video?<><div className="pet-revive-video"><div className="pet-revive-player" ref={container}/><span className="pet-revive-sponsor">{video.channel_name} · Sponsored</span><button className="pet-revive-skip" disabled={busy||watched<30||paused} onClick={()=>answer(true)}>{watched<30?`Skip in ${Math.ceil(30-watched)}s`:'Skip & revive →'}</button><div className="pet-revive-progress" style={{width:`${watched/30*100}%`}}/></div><p className="pet-revive-caption">{video.title}</p></>:<div className="pet-revive-options"><button className="coin" disabled={busy||pending!==null||coins<cost} onClick={pay}><b>✦</b><strong>{cost.toLocaleString()} COINS</strong><small>Return to the game immediately</small></button><button disabled={busy||pending!==null} onClick={advert}><b>▶</b><strong>WATCH & REVIVE</strong><small>30 seconds · No coins needed</small></button></div>}
    {pending!==null?<div className="pet-revive-confirm"><p>{busy?'Returning to your game…':error}</p>{!busy&&<button onClick={()=>answer(pending)}>Retry confirmation</button>}</div>:<><p role="status" className="pet-revive-error">{error}</p>{!video&&<footer><button disabled={busy} onClick={()=>answer(false)}>End run</button><span>Coins and videos share the same three lives.</span></footer>}</>}
    </div>
  </section></div>,document.body);
}
