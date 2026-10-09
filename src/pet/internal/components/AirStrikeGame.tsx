import { PixelCoinBag } from './CoinIndicator';
import { MoleLevelBadge } from './MoleGame';
import { useEffect, useId, useRef, useState } from 'react';
import { AIRCRAFT, awardRun, flightExperience, levelForXp, normalizeProgress, progressKey, UPGRADE_COSTS, upgradeAircraft, type FlightProgress } from './airStrikeProgress.mjs';
import { useGameState } from '../../runtime/SharedPetRuntime';
import { normalizeTalents, talentKey, purchaseTalent,reconcileTalentCloud } from './airStrikeTalents.mjs';
import {unlockedStage,settleCampaign,stageReward} from './airStrikeCampaign.mjs';
import {createCampaignOutbox} from './airStrikeCampaignOutbox.mjs';
import {AirStrikeLeaderboard} from './AirStrikeLeaderboard';
import {AirStrikeTalentTree} from './AirStrikeTalentTree';
import {HangarLaunchCinematic,startHangarLaunchSound} from './HangarLaunchCinematic';
import {AirStrikeResults} from './AirStrikeResults';
import {combatPower,recommendedPower} from './airStrikePower.mjs';
const ROOT='/games/air-strike';
function fitHangar(width:number,height:number){const w=Math.min(Math.max(width,height*1672/941),width/.5);return {width:w,height:w*941/1672};}
function readProgress(userId?:string|null):FlightProgress {
  try{return normalizeProgress(JSON.parse(localStorage.getItem(progressKey(userId))||'{}'));}catch{return normalizeProgress({});}
}
function Aircraft({level,className=''}:{level:number;className?:string}) {
  const id=useId(),[x,y,width,height]=AIRCRAFT[level-1][2];
  return <svg className={className} viewBox={[x,y,width,height].join(' ')} role="img" aria-label={`Tier ${level} aircraft piloted by Gulu`}><defs><clipPath id={id}><rect x={x} y={y} width={width} height={height}/></clipPath></defs><image clipPath={`url(#${id})`} href={ROOT+'/gulu-aircraft.png'} width="1536" height="1024"/></svg>;
}
function RefitScanner({tier}:{tier:number}) {
 const next=Math.min(10,tier+1),baseDamage=1+(tier-1)*.1,nextDamage=1+(next-1)*.1;
 return <div className="sky-refit-layout">
  <aside className="sky-refit-side"><h3>ACTIVE AIRFRAME</h3><div className="sky-refit-tier"><strong>{String(tier).padStart(2,'0')}</strong><span>CURRENT<br/>TIER / 10</span></div><div className="sky-refit-mini"><Aircraft level={tier}/></div><h4>{AIRCRAFT[tier-1][0]}</h4><p>{AIRCRAFT[tier-1][1]}</p><div className="sky-refit-readout"><span>BASE FIREPOWER</span><b>{baseDamage.toFixed(2)}<small>×</small></b><div className="sky-refit-segments">{Array.from({length:10},(_,i)=><i key={i} className={i<tier?'lit':''}/>)}</div></div><span className="sky-refit-status">GULU · COCKPIT SECURED</span></aside>
  <div className="sky-refit-center"><div className="sky-refit-target-label">{tier===10?'FLAGSHIP CONFIGURATION':'NEXT AIRFRAME / PREVIEW'}</div><div className="sky-refit-scanner"><svg viewBox="0 0 440 440" className="sky-refit-radar" aria-hidden="true"><defs><radialGradient id="sky-refit-glow"><stop stopColor="#1ce7e2" stopOpacity=".16"/><stop offset="1" stopColor="#1ce7e2" stopOpacity="0"/></radialGradient></defs><circle cx="220" cy="220" r="205" fill="url(#sky-refit-glow)"/><g fill="none" stroke="#2cb9bd"><circle cx="220" cy="220" r="202" opacity=".25"/><circle cx="220" cy="220" r="187" strokeDasharray="3 9"/><circle cx="220" cy="220" r="161" strokeDasharray="12 8" opacity=".5"/><circle cx="220" cy="220" r="143" opacity=".25"/><path d="M220 5v105M220 330v105M5 220h95M340 220h95M78 78l50 50M312 312l50 50M78 362l50-50M312 128l50-50" opacity=".45"/><path d="M35 190v-48l45-44h45M405 250v48l-45 44h-45" stroke="#eeae58"/></g><g className="sky-refit-orbit" fill="none" stroke="#59fff4" strokeWidth="4"><path d="M220 34a186 186 0 0 1 176 124M220 406A186 186 0 0 1 44 282"/></g>{Array.from({length:40},(_,i)=><path key={i} d="M220 12v9" transform={`rotate(${i*9} 220 220)`} stroke={i%5===0?'#e9bc6a':'#23777e'} strokeWidth={i%5===0?3:1}/>)}</svg><Aircraft level={next} className="sky-refit-aircraft"/><span className="sky-refit-callout left">GULU PILOT<br/><b>CANOPY LOCKED</b></span><span className="sky-refit-callout right">TIER {String(next).padStart(2,'0')}<br/><b>{tier===10?'MAX CONFIG':'REFIT TARGET'}</b></span></div><h3>{AIRCRAFT[next-1][0]}</h3><span className="sky-refit-scan-caption">AIRFRAME ANALYSIS / {tier===10?'COMPLETE':'READY FOR INSTALLATION'}</span></div>
  <aside className="sky-refit-side"><h3>UPGRADE PACKAGE</h3><div className="sky-refit-tier target"><strong>{String(next).padStart(2,'0')}</strong><span>{tier===10?'MAXIMUM':'TARGET'}<br/>TIER / 10</span></div>{AIRCRAFT[next-1][1].split(' · ').map((part,i)=><div className="sky-refit-feature" key={part}><span>0{i+1} / {i===0?'AIRFRAME':'WEAPON SYSTEM'}</span><b>{part}</b><div className="sky-refit-feature-line"/></div>)}<div className="sky-refit-readout"><span>BASE FIREPOWER</span><b>{nextDamage.toFixed(2)}<small>×</small></b><div className="sky-refit-segments">{Array.from({length:10},(_,i)=><i key={i} className={i<next?'lit':''}/>)}</div><p className="sky-refit-gain">{tier===10?'FULLY UPGRADED':`+${((nextDamage/baseDamage-1)*100).toFixed(1)}% vs current airframe`}</p></div><span className="sky-refit-status">{tier===10?'ALL SYSTEMS AT MAX TIER':'UPGRADE AVAILABLE'}</span></aside>
 </div>;
}
function PowerIcon(){
 return <svg className="sky-power-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21l5-5M6 12l6 6" fill="none" stroke="#d5a358" strokeWidth="3" strokeLinecap="square"/><path d="M9 14L18 3h4l-1 5-9 9z" fill="currentColor" stroke="#173e4c" strokeWidth="1"/><path d="M11 14l9-9" fill="none" stroke="#e2fffa" strokeWidth="1"/><path d="M2 20l2-2 3 3-2 2z" fill="#d5a358"/></svg>;
}
function MissionArmorFrame(){
 return <svg className="sky-mission-armor" viewBox="0 0 1180 680" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="sky-mission-steel" x2=".8" y2="1"><stop stopColor="#607783"/><stop offset=".2" stopColor="#1d3746"/><stop offset=".5" stopColor="#3b535c"/><stop offset="1" stopColor="#102332"/></linearGradient><linearGradient id="sky-mission-edge"><stop stopColor="#e2ac58"/><stop offset=".4" stopColor="#56dadd"/><stop offset=".7" stopColor="#234e61"/><stop offset="1" stopColor="#e2ac58"/></linearGradient><pattern id="sky-mission-hazard" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="18" height="18" fill="#142737"/><rect width="8" height="18" fill="#b68c50"/></pattern></defs><path d="M36 3H324L340 15H840L856 3H1144L1177 36V178L1165 194V486L1177 502V644L1144 677H856L840 665H340L324 677H36L3 644V502L15 486V194L3 178V36Z" fill="url(#sky-mission-steel)" stroke="url(#sky-mission-edge)" strokeWidth="3"/><path d="M44 23H312L330 35H850L868 23H1136L1157 44V168L1145 188V492L1157 512V636L1136 657H868L850 645H330L312 657H44L23 636V512L35 492V188L23 168V44Z" fill="#071523" stroke="#63838a" strokeWidth="1"/><g fill="#1b3543" stroke="#6d8890"><path d="M39 6H210L222 20H46L23 44V150L7 164V37Z"/><path d="M1141 6H970L958 20H1134L1157 44V150L1173 164V37Z"/><path d="M7 520L23 534V636L46 660H222L210 674H39L7 642Z"/><path d="M1173 520L1157 534V636L1134 660H958L970 674H1141L1173 642Z"/></g><g strokeLinecap="square" fill="none"><path d="M340 24H460M720 24H840M24 220V300M24 380V460M1156 220V300M1156 380V460" stroke="#55dce4" strokeWidth="4"/><path d="M45 14H110M1070 14H1135M45 668H110M1070 668H1135" stroke="#d9a357" strokeWidth="3"/><path d="M54 105H170M1010 105H1126" stroke="#2ca3b4" strokeWidth="2"/></g><path d="M490 16H690L678 31H502Z" fill="url(#sky-mission-hazard)"/><path d="M490 649H690L702 664H478Z" fill="url(#sky-mission-hazard)"/>{[[42,42],[1138,42],[42,638],[1138,638],[18,178],[1162,178],[18,502],[1162,502]].map(([x,y])=><g key={`${x}-${y}`}><circle cx={x} cy={y} r="6" fill="#0a1b27" stroke="#a1a794" strokeWidth="2"/><path d={`M${x-2} ${y+2}l4-4`} stroke="#75888d"/></g>)}</svg>;
}
export function AirStrikeGame({onClose,userId}:{onClose:()=>void;userId?:string|null}) {
 const {stats,spendCoins,addCoins,addXP,skyTalentCloud,skyCampaignCloud,skyAircraftCloud,skyFlightCloud}=useGameState();
 const flightCloud=useRef(skyFlightCloud);flightCloud.current=skyFlightCloud;
 const [flightCloudStatus,setFlightCloudStatus]=useState<'local'|'loading'|'ready'|'error'>(skyFlightCloud?'loading':'local');
 const syncFlight=useRef<()=>Promise<void>>(async()=>{});
 const aircraftCloud=useRef(skyAircraftCloud);aircraftCloud.current=skyAircraftCloud;
 const [aircraftStatus,setAircraftStatus]=useState<'local'|'loading'|'ready'|'legacy'|'error'>(skyAircraftCloud?'loading':'local');
 const [aircraftRetry,setAircraftRetry]=useState(0),[aircraftLegacy,setAircraftLegacy]=useState(1),aircraftSequence=useRef(0);
 const campaignCloud=useRef(skyCampaignCloud);campaignCloud.current=skyCampaignCloud;
 const [campaignStatus,setCampaignStatus]=useState<'local'|'loading'|'ready'|'error'>(skyCampaignCloud?'loading':'local');
 const [campaignRetry,setCampaignRetry]=useState(0);
 const [leaderboard,setLeaderboard]=useState(false);
 const outbox=useRef<{owner:string;queue:ReturnType<typeof createCampaignOutbox>}|null>(null);
 const syncCampaign=useRef<()=>Promise<void>>(async()=>{});
 const cloud=useRef(skyTalentCloud);cloud.current=skyTalentCloud;
 const activeOwner=useRef(userId);activeOwner.current=userId;
 const [cloudStatus,setCloudStatus]=useState<'local'|'loading'|'ready'|'legacy'|'error'>(skyTalentCloud?'loading':'local');
 const [,setLegacy]=useState<number[]>([]),[cloudRetry,setCloudRetry]=useState(0),cloudSequence=useRef(0);
 const rewardWallet=useRef(addCoins);rewardWallet.current=addCoins;
 const rewardExperience=useRef(addXP);rewardExperience.current=addXP;
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{const image=new Image();image.src=ROOT+'/mission-results-frame.png';},[]);
 useEffect(()=>{const bodyOverflow=document.body.style.overflow,htmlOverflow=document.documentElement.style.overflow;document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden';return()=>{document.body.style.overflow=bodyOverflow;document.documentElement.style.overflow=htmlOverflow;};},[]);
 const [refitViewport,setRefitViewport]=useState(()=>({width:typeof window==='undefined'?1180:window.innerWidth,height:typeof window==='undefined'?680:window.innerHeight}));
 const refitScale=Math.min(1,Math.max(.1,(refitViewport.width-32)/1180),Math.max(.1,(refitViewport.height-32)/680));
 const [scene,setScene]=useState(()=>fitHangar(typeof window==='undefined'?960:window.innerWidth,typeof window==='undefined'?540:window.innerHeight));
 useEffect(()=>{if(!root.current)return;const observer=new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;setRefitViewport({width,height});setScene(fitHangar(width,height));});observer.observe(root.current);return()=>observer.disconnect();},[]);
 const [buying,setBuying]=useState(false),purchaseLock=useRef(false);
 const [owned,setOwned]=useState<number[]>(()=>{try{return normalizeTalents(JSON.parse(localStorage.getItem(talentKey(userId))||'[]'));}catch{return [];}}),ownedRef=useRef(owned);
 const [flightTalents,setFlightTalents]=useState<number[]>([]);
 const iframe=useRef<HTMLIFrameElement>(null),completed=useRef(new Set<number>());
 const [progress,setProgress]=useState(()=>readProgress(userId)),current=useRef(progress);
 const [mission,setMission]=useState(false),[selectedStage,setSelectedStage]=useState(()=>unlockedStage(readProgress(userId))),[mode,setMode]=useState<'campaign'|'endless'>('campaign');
 const [flight,setFlight]=useState({stage:1,mode:'campaign',token:'',owner:userId||'guest'}),checkpoint=useRef(0);
 const [runSummary,setRunSummary]=useState<{coins:number;xp:number;score:number;title:string}|null>(null);
 const checkpointCoins=useRef(0);
 const [view,setView]=useState<'hangar'|'flight'>('hangar');
 const [flightTier,setFlightTier]=useState(1),[repair,setRepair]=useState(false),[talents,setTalents]=useState(false);
 const [ready,setReady]=useState(false),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 const [notice,setNotice]=useState(''),[arming,setArming]=useState(false);
 const launchBusy=useRef(false),launchSound=useRef<(()=>void)|null>(null);
 const level=levelForXp(progress.xp),tier=progress.aircraftTier,cost=UPGRADE_COSTS[tier-1];
 const power=combatPower(tier,owned);
 const save=(value:FlightProgress)=>{current.current=value;setProgress(value);try{localStorage.setItem(progressKey(userId),JSON.stringify(value));}catch{setNotice('Your browser cannot save progress. Keep this page open.');}};
 useEffect(()=>()=>{launchSound.current?.();},[]);
 useEffect(()=>{launchSound.current?.();launchSound.current=null;launchBusy.current=false;const next=readProgress(userId);current.current=next;setProgress(next);let items:number[]=[];try{items=normalizeTalents(JSON.parse(localStorage.getItem(talentKey(userId))||'[]'));}catch{}ownedRef.current=items;setOwned(items);setSelectedStage(unlockedStage(next));setMode('campaign');setView('hangar');setArming(false);setRepair(false);setTalents(false);setMission(false);setLeaderboard(false);setNotice('');},[userId]);
 useEffect(()=>{
  let stopped=false;
  const service=campaignCloud.current,owner=userId;
  if(!service||!owner){setCampaignStatus('local');syncCampaign.current=async()=>{};return;}
  let storage:Storage;
  try{storage=localStorage;}catch{setCampaignStatus('error');setNotice('Browser storage is unavailable. Pending results cannot be saved.');return;}
  if(outbox.current?.owner!==owner)outbox.current={owner,queue:createCampaignOutbox(storage,owner)};
  const queue=outbox.current.queue;
  const importKey=progressKey(owner)+':campaign-import';
  let baseline={highestCleared:0,endlessBest:0};
  try{
   const existing=storage.getItem(importKey);
   if(existing){const parsed=normalizeProgress(JSON.parse(existing));baseline={highestCleared:parsed.highestCleared,endlessBest:parsed.endlessBest};}
   else{baseline={highestCleared:current.current.highestCleared,endlessBest:current.current.endlessBest};storage.setItem(importKey,JSON.stringify(baseline));}
  }catch{setCampaignStatus('error');setNotice('Cannot save migration records. Enable browser storage and retry.');return;}
  let working:Promise<void>|null=null,requested=false;
  const refresh=()=>{
   if(working){requested=true;return working;}
   working=(async()=>{
    if(stopped||activeOwner.current!==owner)return;
    setCampaignStatus('loading');
    try{
     // Import only the snapshot captured before cloud play, never pending new wins.
     let remote=await service.merge(baseline);
     do{
      requested=false;
      await queue.flush(run=>{if(activeOwner.current!==owner)throw Error('Account changed');return service.record(run);},receipt=>{
       if(activeOwner.current!==owner)throw Error('Account changed');
       if(!stopped){save({...current.current,highestCleared:Math.max(current.current.highestCleared,receipt.highestCleared),endlessBest:Math.max(current.current.endlessBest,receipt.endlessBest)});setNotice(receipt.reward?`Stage reward: +${receipt.reward} coins`:'');}
      });
      remote=await service.load();
      if(stopped||activeOwner.current!==owner)return;
     }while(requested||queue.size());
     save({...current.current,highestCleared:Math.max(current.current.highestCleared,remote.highestCleared),endlessBest:Math.max(current.current.endlessBest,remote.endlessBest)});
     setSelectedStage(value=>Math.max(1,Math.min(100,value)));
     setCampaignStatus('ready');
    }catch{if(!stopped&&activeOwner.current===owner){setCampaignStatus('error');setNotice(queue.size()?'Results are pending. Reconnect and retry to confirm your reward.':'Cannot load your save. You can continue with local progress.');}}
   })().finally(()=>{working=null;});
   return working;
  };
  syncCampaign.current=refresh;void refresh();window.addEventListener('focus',refresh);window.addEventListener('online',refresh);
  return()=>{stopped=true;window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);};
 },[userId,!!skyCampaignCloud,campaignRetry]);
 useEffect(()=>{
  let stopped=false;const owner=userId;
  const refresh=async()=>{
   if(!aircraftCloud.current||!owner){setAircraftStatus('local');return;}
   if(purchaseLock.current)return;
   const sequence=++aircraftSequence.current;setAircraftStatus('loading');
   try{
    const remote=await aircraftCloud.current.load();
    if(stopped||sequence!==aircraftSequence.current||activeOwner.current!==owner)return;
    const key=progressKey(owner)+':aircraft';let legacyTier=1;
    try{
     legacyTier=Math.max(1,Math.min(10,Number(localStorage.getItem(key+':legacy'))||1));
     if(!localStorage.getItem(key+':cloud'))legacyTier=Math.max(legacyTier,current.current.aircraftTier);
     localStorage.setItem(key+':legacy',String(legacyTier));localStorage.setItem(key+':cloud','1');
    }catch{legacyTier=current.current.aircraftTier;}
    save({...current.current,aircraftTier:remote});setAircraftLegacy(legacyTier);
    setAircraftStatus(legacyTier>remote?'legacy':'ready');
   }catch{if(!stopped&&sequence===aircraftSequence.current&&activeOwner.current===owner)setAircraftStatus('error');}
  };
  void refresh();window.addEventListener('focus',refresh);
  return()=>{stopped=true;aircraftSequence.current++;window.removeEventListener('focus',refresh);};
 },[userId,!!skyAircraftCloud,repair,aircraftRetry]);
 useEffect(()=>{
  let stopped=false,working:Promise<void>|null=null,requested=false;const service=flightCloud.current,owner=userId;
  if(!service||!owner){setFlightCloudStatus('local');syncFlight.current=async()=>{};return;}
  const refresh=()=>{
   if(working){requested=true;return working;}
   working=(async()=>{
    if(stopped||activeOwner.current!==owner)return;
    setFlightCloudStatus('loading');
    try{
     do{
      requested=false;
      const snapshot={xp:current.current.xp,best:current.current.best,runs:current.current.runs};
      const remote=await service.sync(snapshot);
      if(stopped||activeOwner.current!==owner)return;
      save({...current.current,xp:Math.max(current.current.xp,remote.xp),best:Math.max(current.current.best,remote.best),runs:Math.max(current.current.runs,remote.runs)});
     }while(requested);
     setFlightCloudStatus('ready');
    }catch{if(!stopped&&activeOwner.current===owner)setFlightCloudStatus('error');}
   })().finally(()=>{working=null;});return working;
  };
  syncFlight.current=refresh;void refresh();window.addEventListener('focus',refresh);window.addEventListener('online',refresh);
  return()=>{stopped=true;window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);};
 },[userId,!!skyFlightCloud,campaignRetry]);
 const queueCampaignResult=(run:{token:string;stage:number;mode:string;outcome:string;wave:number})=>{
  if(!userId||outbox.current?.owner!==userId){setNotice('Results are not queued yet. Keep this page open.');return;}
  try{outbox.current.queue.enqueue(run);}catch{setNotice('Pending results cannot be saved locally. Keep this page open.');}
  void syncCampaign.current();
 };
 useEffect(()=>{
  let stopped=false;
  const refresh=async()=>{
   if(!cloud.current||!userId){setCloudStatus('local');setLegacy([]);return;}
   if(purchaseLock.current)return;
   const sequence=++cloudSequence.current;setCloudStatus('loading');
   try{
    const remote=await cloud.current.load();
    if(stopped||sequence!==cloudSequence.current||activeOwner.current!==userId)return;
    const key=talentKey(userId);let old:number[]=[];
    try{old=normalizeTalents(JSON.parse(localStorage.getItem(key+':legacy')||'[]'));if(!localStorage.getItem(key+':cloud'))old=normalizeTalents([...old,...ownedRef.current]);}catch{old=ownedRef.current;}
    const merged=reconcileTalentCloud(old,remote);
    // Preserve old paid local records for human review; never grant or recharge them automatically.
    try{if(old.length)localStorage.setItem(key+':legacy',JSON.stringify(old));localStorage.setItem(key+':cloud','1');localStorage.setItem(key,JSON.stringify(merged.talents));}catch{setNotice('Cannot save the local cache.');}
    ownedRef.current=merged.talents;setOwned(merged.talents);setLegacy(merged.legacy);setCloudStatus(merged.legacy.length?'legacy':'ready');
   }catch{if(!stopped&&sequence===cloudSequence.current)setCloudStatus('error');}
  };
  void refresh();window.addEventListener('focus',refresh);
  return()=>{stopped=true;cloudSequence.current++;window.removeEventListener('focus',refresh);};
 },[userId,!!skyTalentCloud,talents,cloudRetry]);
 useEffect(()=>{
  if(!repair&&!talents&&!mission)return;
  const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){setRepair(false);setTalents(false);setMission(false);}};
  window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);
 },[repair,talents,mission]);
 useEffect(()=>{
  if(view!=='flight')return;
  const timer=setTimeout(()=>setFailed(true),45000);
  const receive=(event:MessageEvent)=>{
   if(event.origin!==location.origin||event.source!==iframe.current?.contentWindow||event.data?.source!=='air-strike'||flight.owner!==(userId||'guest'))return;
   const data=event.data;
   if(data.type==='READY'){clearTimeout(timer);setReady(true);setFailed(false);iframe.current?.contentWindow?.focus();}
   if(data.type==='ERROR'){clearTimeout(timer);setFailed(true);}
   if(data.type==='HANGAR'||data.type==='CLOSE')setView('hangar');
   if(data.type==='ENDLESS_CHECKPOINT'&&flight.mode==='endless'&&data.token===flight.token&&Number.isSafeInteger(data.wave)&&data.wave>checkpoint.current&&data.wave<=100000&&data.wave%10===0){
    const reward=(data.wave-checkpoint.current)/10*stageReward(100,false);checkpoint.current=data.wave;
    checkpointCoins.current+=reward;
    save({...current.current,endlessBest:Math.max(current.current.endlessBest,data.wave)});
    if(campaignCloud.current)queueCampaignResult({token:flight.token,stage:100,mode:'endless',outcome:'checkpoint',wave:data.wave});else rewardWallet.current(reward);
   }
   if(data.type==='RUN_FINISHED'&&Number.isSafeInteger(data.runId)&&data.runId>0&&!completed.current.has(data.runId)){
    if(data.token!==flight.token||!Number.isSafeInteger(data.score)||data.score<0||data.score>1000000||!['victory','defeat'].includes(data.outcome))return;
    completed.current.add(data.runId);
    const earnedXp=flightExperience(data);
    if(earnedXp>0)rewardExperience.current(earnedXp);
    const result=settleCampaign(awardRun(current.current,data),{stage:flight.stage,mode:flight.mode,wave:data.wave,outcome:data.outcome});save(result.progress);void syncFlight.current();
    setRunSummary({coins:checkpointCoins.current+result.coins,xp:earnedXp,score:data.score,title:data.abandoned?'FLIGHT ENDED':data.outcome==='victory'?'MISSION CLEAR':'MISSION FAILED'});
    if(campaignCloud.current){queueCampaignResult({token:flight.token,stage:flight.stage,mode:flight.mode,outcome:data.outcome,wave:flight.mode==='endless'&&Number.isSafeInteger(data.wave)?Math.max(0,Math.min(100000,data.wave)):0});if(result.coins)setSelectedStage(unlockedStage(result.progress));}
    else if(result.coins){rewardWallet.current(result.coins);setNotice(`Stage reward: +${result.coins} coins`);setSelectedStage(unlockedStage(result.progress));}
   }
  };
  window.addEventListener('message',receive);
  return()=>{clearTimeout(timer);window.removeEventListener('message',receive);};
 },[view,retry,userId,flight]);
 const launch=()=>{
  if(launchBusy.current||arming||purchaseLock.current||(!!flightCloud.current&&flightCloudStatus==='loading')||(!!aircraftCloud.current&&aircraftStatus==='loading')||(!!campaignCloud.current&&campaignStatus==='loading')||(mode==='endless'&&current.current.highestCleared<100))return;
  launchBusy.current=true;setMission(false);setNotice('');setArming(true);
  setFlight({stage:mode==='endless'?100:Math.max(1,Math.min(100,selectedStage)),mode,token:crypto.randomUUID(),owner:userId||'guest'});
  checkpoint.current=0;checkpointCoins.current=0;setRunSummary(null);setFlightTier(current.current.aircraftTier);setFlightTalents([...ownedRef.current]);completed.current.clear();setReady(false);setFailed(false);
  launchSound.current?.();launchSound.current=startHangarLaunchSound();
 };
 const completeLaunch=()=>{launchSound.current?.();launchSound.current=null;launchBusy.current=false;setArming(false);setView('flight');};
 const replay=()=>{setRunSummary(null);completed.current.clear();checkpoint.current=0;checkpointCoins.current=0;setFlight({...flight,token:crypto.randomUUID()});setReady(false);setFailed(false);setRetry(v=>v+1);};
 const buyTalent=async(id:number)=>{if(purchaseLock.current||(cloud.current&&cloudStatus!=='ready'))return;const owner=userId;purchaseLock.current=true;cloudSequence.current++;setBuying(true);try{const result=cloud.current?await cloud.current.purchase(id):await purchaseTalent(ownedRef.current,id,spendCoins);if(activeOwner.current!==owner)return;if(!result.includes(id)){setNotice('Insufficient coins or payment incomplete.');return;}ownedRef.current=result;setOwned(result);try{localStorage.setItem(talentKey(userId),JSON.stringify(result));setNotice(cloud.current?'Talent unlocked. Active on your next flight.':'Talent unlocked. Active on your next flight.');}catch{setNotice('Unlocked, but the browser could not save the cache.');}}catch{if(activeOwner.current===owner){setCloudStatus('error');setNotice('Purchase unconfirmed. Reload your save to check the result; you will not be charged again locally.');}}finally{purchaseLock.current=false;setBuying(false);}};
 const purchase=async()=>{
  if(purchaseLock.current||current.current.aircraftTier===10||(aircraftCloud.current&&aircraftStatus!=='ready'))return;
  const owner=userId;purchaseLock.current=true;aircraftSequence.current++;setBuying(true);
  try{
   const old=current.current;
   const nextTier=aircraftCloud.current?await aircraftCloud.current.purchase(old.aircraftTier+1):(await upgradeAircraft(old,spendCoins)).aircraftTier;
   if(activeOwner.current!==owner)return;
   if(nextTier===old.aircraftTier){setNotice('Insufficient coins or payment incomplete. Try again later.');return;}
   save({...current.current,aircraftTier:nextTier});setNotice(`Upgrade complete: ${AIRCRAFT[nextTier-1][0]}`);
  }catch{if(activeOwner.current===owner){setAircraftStatus('error');setNotice('Upgrade unconfirmed. Reload your save to check the result; you will not be charged again locally.');}}
  finally{purchaseLock.current=false;setBuying(false);}
 };
 return <div ref={root} className={`sky-hangar-root ${arming?'sky-launching':''}`}>
 <style>{`
 @font-face{font-family:SkyPixel;src:url('${ROOT}/Quadrit.ttf');font-display:swap}
 .sky-mission-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin:14px 0}.sky-mission-grid button{padding:10px 0}.sky-mission-grid button.selected{outline:2px solid #f4d493;background:#4a6259}.sky-mission-grid button.cleared{border-color:#72aa96}.sky-hangar-reward{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);padding:5px 14px;background:#10252de0;color:#ffe1a1;font-size:12px;z-index:4;white-space:nowrap}
 .sky-launching > .sky-hangar-header,.sky-launching > .sky-hangar-flightlevel,.sky-launching > .sky-hangar-hud,.sky-launching > .sky-hangar-reward,.sky-launching > .sky-hangar-world{visibility:hidden}
 .sky-hangar-root{position:fixed;inset:0;z-index:100;overflow:clip;overscroll-behavior:none;background:#0c2027;color:#eae3ce;font-family:system-ui,sans-serif}
 .sky-hangar-scene{position:absolute;inset:0;background:url('${ROOT}/hangar-rankings.png') center/cover;filter:blur(5px) brightness(.4)}
 .sky-hangar-world{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:url('${ROOT}/hangar-rankings.png') center/100% 100%;isolation:isolate}
 .sky-hangar-world:before{content:'';position:absolute;inset:0;background:linear-gradient(#06182033,transparent 40%,#06101433);pointer-events:none}

 .sky-hangar-header{position:absolute;top:24px;left:24px;right:3%;display:flex;align-items:center;gap:18px;z-index:3;pointer-events:none}
 .sky-hangar-brand{font:clamp(22px,3vw,40px)/1 SkyPixel,monospace;color:#f4d493;text-shadow:3px 3px #061820}
 .sky-hangar-back{pointer-events:auto;box-sizing:border-box;display:flex;align-items:center;justify-content:center;border:4px solid #e7b55b;padding:0;background:#5a3a22;color:#ffe3a0;width:56px;height:56px;box-shadow:4px 4px 0 #3f2a1b;cursor:pointer;transition:transform .15s}.sky-hangar-back:hover{transform:translateX(-4px)}.sky-hangar-back svg{width:32px;height:32px}.sky-hangar-wallet{position:absolute;right:7.25rem;top:1.5rem;min-width:9.5rem;height:3.5rem;padding:.5rem 1rem;border:4px solid #5a3a22;background:#fff0ad;box-shadow:5px 5px 0 #3523148c;display:flex;align-items:center;gap:.5rem;color:#3f321f;font-size:20px;font-weight:900;letter-spacing:.05em;box-sizing:border-box}.sky-hangar-wallet svg{width:32px;height:32px}.sky-hangar-hud{position:absolute;inset:0;pointer-events:none;z-index:4}.sky-mission-launch{position:sticky;bottom:-24px;margin:20px -24px -24px;padding:16px 24px;background:#10252df5;border-top:1px solid #b99960;display:flex;align-items:center;justify-content:space-between;gap:12px}.sky-mission-launch p{margin:0}
 .sky-permanent-power{display:block;text-align:center;font:12px SkyPixel,monospace;letter-spacing:1px;color:#80c8ce;margin-top:8px}.sky-permanent-power b{color:#f4d493;font-size:16px;margin-left:6px}.sky-stage-power{display:flex;gap:22px;align-items:center;margin-left:auto;margin-right:22px;font:12px SkyPixel,monospace;color:#80bacb}.sky-stage-power span{display:flex;align-items:center;gap:8px}.sky-stage-power b{font-size:21px;color:#9ffff0}.sky-stage-power .challenging b{color:#efb768}
 .sky-hangar-flightlevel{position:absolute;top:29px;left:50%;transform:translateX(-50%);font:clamp(20px,2.2vw,31px) SkyPixel,monospace;color:#f4d493;text-shadow:2px 3px #061820;z-index:2;white-space:nowrap}
 .sky-hangar-display{position:absolute;left:50%;top:45%;width:clamp(220px,28vw,400px);height:clamp(240px,56vh,470px);transform:translate(-50%,-50%)}
 .sky-hangar-platform{position:absolute;left:0;right:0;bottom:10%;height:48%;border:8px solid #6b7d7a;background:repeating-linear-gradient(90deg,#101e2560 0 18px,#5d797533 18px 20px);box-shadow:0 17px #101e25,0 24px 30px #0009,inset 0 0 0 3px #c5ab69;transform:perspective(650px) rotateX(24deg)}
 .sky-hangar-plane{position:absolute;inset:0;width:100%;height:100%;filter:drop-shadow(8px 18px 2px #0009);image-rendering:pixelated}
 .sky-hangar-clamp{position:absolute;top:55%;width:15%;height:22px;background:linear-gradient(#9aa69a,#34494d);border:3px solid #172a30;box-shadow:0 7px #0c191f;z-index:2}.sky-hangar-clamp:after{content:'';position:absolute;top:18px;width:9px;height:55px;background:#82948a;border:3px solid #263d43;box-shadow:4px 0 #c8ab62}.sky-hangar-clamp.left{left:-3%}.sky-hangar-clamp.right{right:-3%}.sky-hangar-clamp.right:after{right:0}
 .sky-hangar-station{position:absolute;top:67%;height:18%;padding:0;border:3px solid #efd08abf;background:transparent;box-shadow:inset 0 0 10px #f1ce6a33,0 0 15px #edbd6055;animation:sky-interact-glow .85s ease-in-out infinite;cursor:pointer;color:#eeddb5;z-index:2;border-radius:5px;transition:box-shadow .2s,border-color .2s}
 .sky-hangar-station.launch{left:37%;width:7%}.sky-hangar-station.repair{left:55%;width:11%}.sky-hangar-station.talents{left:66.8%;top:64.8%;width:6.4%;height:20.2%}
 .sky-hangar-station:hover,.sky-hangar-station:focus-visible{animation:none;border-color:#fff1ad;box-shadow:inset 0 0 20px #f6d48355,0 0 28px #ffd66b99;outline:none}
 .sky-hangar-back:focus-visible,.sky-hangar-button:focus-visible{outline:3px solid #a5f6ed;outline-offset:5px}
 .sky-hangar-station-label{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:3px;font-size:12px;font-weight:600;letter-spacing:1px;text-shadow:2px 2px #061820;white-space:nowrap;color:#d6cbaa}

 .sky-hangar-station-label small{display:block;margin:3px 0 0;font-size:9px;font-weight:500;letter-spacing:.5px;color:#b4d2c9}
 @keyframes sky-interact-glow{0%,100%{border-color:#d7b86eaa;box-shadow:inset 0 0 8px #efc65b22,0 0 10px #dfad4e44}50%{border-color:#fff1ae;box-shadow:inset 0 0 18px #ffda7255,0 0 26px #ffd36c99}}
 .sky-hangar-station.arming:after{content:'';position:absolute;left:37%;top:36%;width:18%;height:10%;background:#fa4a28;box-shadow:0 0 16px #ff6533;animation:sky-launch-light .4s ease-in-out infinite alternate;border-radius:50%}
 @keyframes sky-launch-light{to{opacity:.3}}

 .sky-hangar-dialog-shade{position:absolute;inset:0;background:#031017b8;display:grid;place-items:center;padding:16px;z-index:6}
 .sky-hangar-dialog{width:min(700px,100%);max-height:95%;overflow:auto;border:2px solid #b99960;background:linear-gradient(135deg,#243a40,#10252d);padding:24px;box-shadow:inset 0 0 0 6px #0c1d24,0 20px 70px #0009}.sky-hangar-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px}.sky-hangar-dialog h2{font-size:22px;margin:0}.sky-hangar-coins{color:#edcf7d;font-weight:700;text-align:right;font-size:17px}.sky-hangar-upgrade-preview{display:flex;align-items:center;justify-content:center;gap:25px;margin:16px 0}.sky-hangar-upgrade-preview svg{height:180px;width:200px;image-rendering:pixelated}.sky-hangar-upgrade-preview figure{margin:0;text-align:center}.sky-hangar-upgrade-preview figcaption{font-size:13px;color:#d4cbb3}.sky-hangar-upgrade-preview b{font-size:30px;color:#dbbf7f}.sky-hangar-dialog p{font-size:14px;line-height:1.7;color:#bccbc8}.sky-hangar-button{border:1px solid #b69968;background:#28404a;color:#eadbb9;padding:11px 18px;font-weight:650;cursor:pointer;min-height:40px}.sky-hangar-button.buy{background:#d7b16b;color:#17272c;min-width:180px}.sky-hangar-button:disabled{opacity:.5;cursor:not-allowed}.sky-hangar-dialog-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.sky-hangar-notice{color:#f6d48b!important;min-height:24px}
 .sky-hangar-talent-seal{margin:30px auto;width:90px;height:90px;border:2px solid #b99b62;display:grid;place-items:center;color:#edcf88;font:42px SkyPixel,monospace;background:radial-gradient(#395052,#13282f);box-shadow:inset 0 0 0 6px #162d34,0 0 28px #cfa95222}.sky-hangar-talent-status{text-align:center;color:#efd397!important;font:20px SkyPixel,monospace!important}
 .sky-talent-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}.sky-talent-card{border:1px solid #607477;background:#0c202a;padding:14px;display:flex;flex-direction:column;gap:8px}.sky-talent-card.owned{border-color:#8abc9c;background:#18332e}.sky-talent-card h3{margin:0;font-size:16px;color:#ecd398}.sky-talent-card p{margin:0;flex:1}.sky-talent-card small{color:#bfd6d4}.sky-talent-card button{width:100%}
 @media(max-height:500px){.sky-hangar-header{top:12px}.sky-hangar-brand{font-size:24px}.sky-hangar-flightlevel{top:18px;font-size:22px}.sky-hangar-display{height:225px;width:220px;top:45%}.sky-hangar-station-label{font-size:11px}.sky-hangar-dialog{padding:18px}.sky-hangar-upgrade-preview{margin:8px 0}.sky-hangar-upgrade-preview svg{height:100px;width:130px}.sky-hangar-dialog p{margin:8px 0}}
 @media(max-width:600px) and (min-height:501px){.sky-hangar-header{left:16px;top:16px;gap:12px}.sky-hangar-brand{font-size:23px}.sky-hangar-flightlevel{top:83px;font-size:27px}.sky-hangar-display{top:40%;width:220px;height:270px}.sky-hangar-world{mask-image:linear-gradient(transparent,#000 8%,#000 92%,transparent)}.sky-hangar-station-label{font-size:12px;letter-spacing:1px}.sky-hangar-dialog{padding:18px}.sky-hangar-upgrade-preview{gap:5px}.sky-hangar-upgrade-preview svg{width:130px;height:160px}}
 @media(prefers-reduced-motion:reduce){.sky-hangar-station{transition:none;animation:none}.sky-hangar-station.arming:after{animation:none}}
 @media(max-width:600px){.sky-hangar-hud{transform:scale(.7);transform-origin:top right;left:-42.857%}.sky-hangar-brand{display:none}.sky-mission-launch{bottom:-18px;margin-left:-18px;margin-right:-18px;margin-bottom:-18px;padding:12px 18px}.sky-hangar-reward{max-width:90%;white-space:normal;text-align:center}}
 /* Armored hangar terminals share the scene's worn teal steel and amber lighting. */
 .sky-hangar-dialog-shade{position:fixed;box-sizing:border-box;min-height:0;background:#030b10b8;backdrop-filter:blur(3px);padding:24px}
 .sky-hangar-dialog{box-sizing:border-box;position:relative;width:min(880px,100%);max-height:calc(100dvh - 48px);border:4px solid #516469;border-top-color:#9aaa9d;border-bottom-color:#26383d;padding:28px;background:linear-gradient(125deg,#22363be8,#0c1a21f5 60%),url('${ROOT}/hangar-rankings.png') center/cover;background-attachment:local;box-shadow:0 0 0 2px #111c21,0 0 0 5px #af8c48,0 18px 65px #000d,inset 0 0 0 7px #111f25,inset 0 0 60px #0008;scrollbar-width:thin;scrollbar-color:#c89c4f #111f25}
 .sky-hangar-dialog header{position:sticky;top:-28px;z-index:3;min-height:72px;margin:-28px -28px 24px;padding:22px 28px 20px;background:radial-gradient(circle at 12px 14px,#162226 0 3px,#a89971 3px 5px,transparent 6px),radial-gradient(circle at calc(100% - 12px) 14px,#162226 0 3px,#a89971 3px 5px,transparent 6px),linear-gradient(110deg,#34494e,#1a2a31 70%);border-bottom:3px solid #101b20;box-shadow:0 2px #a68b4a,0 7px 16px #0007}
 .sky-hangar-dialog header:after{content:'';position:absolute;bottom:-5px;left:28px;width:110px;height:4px;background:repeating-linear-gradient(135deg,#e7b859 0 9px,#17252b 9px 18px)}
 .sky-panel-kicker{display:block;margin-bottom:7px;font:10px monospace;letter-spacing:2.3px;color:#92c7c3}
 .sky-hangar-dialog h2{font:clamp(20px,2vw,27px)/1.2 SkyPixel,monospace;color:#f4d493;text-shadow:2px 2px #10191c}
 .sky-hangar-dialog header .sky-hangar-button{flex-shrink:0;width:42px;height:42px;padding:0;background:linear-gradient(#465553,#23363b);border:2px solid #b7a371;box-shadow:inset 0 0 0 3px #1b2b30,3px 3px #0b171d;font-size:23px;color:#ffe6b4}
 .sky-hangar-dialog p{color:#c0cfca}.sky-hangar-notice:empty{display:none}
 .sky-hangar-button{border:2px solid #677d7e;border-top-color:#a5b6a7;background:linear-gradient(#354e55,#1e333c);box-shadow:inset 0 0 0 2px #17272d,3px 3px #08151bd9;color:#e4d7b8;letter-spacing:.4px;transition:filter .15s,transform .15s}
 .sky-hangar-button:hover:not(:disabled){filter:brightness(1.2);transform:translateY(-1px)}
 .sky-hangar-button.buy{border:2px solid #f6d48b;border-bottom-color:#977139;background:linear-gradient(#e9c477,#bd8c42);box-shadow:inset 0 0 0 2px #aa803e,3px 3px #0a171b;color:#17272c;text-shadow:0 1px #f6d690;font-weight:800}
 .sky-hangar-button:disabled{opacity:.52;filter:saturate(.45)}
 .sky-hangar-upgrade-preview{gap:20px;align-items:stretch;margin:26px 0}
 .sky-hangar-upgrade-preview figure{position:relative;flex:1;min-width:0;padding:17px 10px 15px;border:2px solid #5a7173;background:linear-gradient(#10252b99,#0b171de8),repeating-linear-gradient(0deg,transparent 0 23px,#69b6b12f 23px 24px),repeating-linear-gradient(90deg,transparent 0 23px,#69b6b12f 23px 24px);box-shadow:inset 0 0 0 4px #09171b,inset 0 0 38px #5ad4cd0d,3px 4px #09171c}
 .sky-hangar-upgrade-preview figure:after{content:'';display:block;margin:14px auto 0;width:65%;height:5px;background:repeating-linear-gradient(135deg,#c6a35f 0 8px,#1a2c31 8px 16px)}
 .sky-bay-label{display:block;margin-bottom:12px;color:#92bdb7;font:9px monospace;letter-spacing:1.4px}
 .sky-hangar-upgrade-preview svg{height:200px;width:100%;filter:drop-shadow(0 12px 5px #0009)}
 .sky-hangar-upgrade-preview figcaption{margin-top:12px;font-size:13px;color:#f2d699}
 .sky-hangar-upgrade-preview b{align-self:center;color:#d8af65;text-shadow:0 0 12px #e9bb5e66}
 .sky-hangar-dialog-actions{margin-top:22px;padding-top:20px;border-top:1px solid #58706e}.sky-hangar-dialog-actions>span{font:14px monospace;color:#f1d394}
 .sky-talent-grid{gap:18px}.sky-talent-card{position:relative;padding:18px;border:2px solid #496267;border-top-color:#8d9f92;background:radial-gradient(circle at calc(100% - 9px) 9px,#0a171d 0 2px,#778b81 2px 3px,transparent 4px),linear-gradient(145deg,#2b4245eb,#101f27f5);box-shadow:inset 0 0 0 3px #14252b,4px 4px #07131ac4}
 .sky-talent-card.owned{border-color:#579e8b;border-top-color:#a6c7a8;background:linear-gradient(145deg,#2a5048,#102d2a);box-shadow:inset 0 0 0 3px #163a33,0 0 14px #53c5a419,4px 4px #07131ac4}
 .sky-talent-module{display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;padding-bottom:12px;border-bottom:1px solid #627d7355}
 .sky-module-number{display:grid;place-items:center;width:36px;height:32px;border:1px solid #9c8b60;background:#11252b;color:#e6c379;font:17px SkyPixel,monospace;box-shadow:inset 0 0 0 3px #21363b}
 .sky-module-state{color:#8eafac;font:9px monospace;letter-spacing:1.5px}.owned .sky-module-state{color:#90e2c0}.sky-module-state:before{content:'';display:inline-block;width:5px;height:5px;margin-right:7px;background:#bca468;box-shadow:0 0 6px #bca46888}.owned .sky-module-state:before{background:#7bdfb3;box-shadow:0 0 8px #7bdfb3}
 .sky-talent-card h3{color:#f0d18e;font-size:17px}.sky-talent-card small{margin:6px 0;color:#a5bcb6;font:12px monospace}.sky-talent-card button{margin-top:4px}
 .sky-panel-mission h3{display:flex;align-items:center;gap:10px;margin:25px 0 12px;font:15px SkyPixel,monospace;color:#e8c47e;letter-spacing:.5px}.sky-panel-mission h3:before{content:'';width:5px;height:18px;background:#d5aa58;box-shadow:0 0 10px #d5aa5844}
 .sky-mission-grid{gap:10px;padding:12px;border:1px solid #485d60;background:#07182099;box-shadow:inset 0 0 18px #0005}
 .sky-mission-grid button{min-height:54px;font:16px SkyPixel,monospace;position:relative}.sky-mission-grid button.selected{outline:2px solid #ffe1a0;outline-offset:1px;background:linear-gradient(#476d68,#294b4a);box-shadow:inset 0 0 0 3px #152e31,0 0 16px #e8c57533;color:#fff0bc}.sky-mission-grid button.cleared{border-color:#71b29d}
 .sky-mission-launch{bottom:-28px;margin:24px -28px -28px;padding:20px 28px;background:linear-gradient(#30474a,#16292f);border-top:3px solid #947c45;box-shadow:0 -6px 22px #0007;z-index:4}.sky-mission-launch:before{content:'';position:absolute;left:0;right:0;top:-5px;height:4px;background:repeating-linear-gradient(135deg,#b69a58 0 12px,#17282c 12px 24px)}
 @media(max-width:600px),(max-height:500px){.sky-hangar-dialog-shade{padding:12px}.sky-hangar-dialog{max-height:calc(100dvh - 24px);padding:18px}.sky-hangar-dialog header{top:-18px;margin:-18px -18px 18px;padding:16px 18px;min-height:60px}.sky-panel-kicker{font-size:8px;letter-spacing:1.4px}.sky-hangar-dialog h2{font-size:19px}.sky-hangar-upgrade-preview svg{height:150px}.sky-hangar-upgrade-preview{gap:8px}.sky-bay-label{font-size:8px;letter-spacing:.3px}.sky-hangar-upgrade-preview figure{padding:12px 6px}.sky-mission-launch{bottom:-18px;margin:18px -18px -18px;padding:14px 18px}.sky-mission-launch .buy{min-width:130px}.sky-mission-grid{gap:7px;padding:8px}.sky-mission-grid button{font-size:12px;min-height:44px}.sky-talent-grid{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}}
 .sky-refit-dialog{width:min(1180px,100%);border:1px solid #285b69;border-top:3px solid #51dfe0;padding:24px;background:radial-gradient(ellipse at 50% 45%,#10364288,transparent 65%),repeating-linear-gradient(0deg,transparent 0 39px,#2184920b 39px 40px),repeating-linear-gradient(90deg,transparent 0 39px,#2184920b 39px 40px),#070f1d;box-shadow:0 0 0 4px #0b1b28,0 0 0 5px #21515c,0 24px 80px #000d,inset 0 0 80px #0005;scrollbar-color:#42bec5 #091a27}
 .sky-refit-dialog header{top:-24px;margin:-24px -24px 8px;padding:18px 24px;min-height:52px;background:linear-gradient(90deg,#0d2534,#080f1b);border-bottom:1px solid #1b4c5a;box-shadow:none}.sky-refit-dialog header:after{left:24px;bottom:-2px;background:#44e7df;width:80px;height:3px;box-shadow:0 0 12px #44e7df88}.sky-refit-dialog h2{color:#e2f9ff;font:23px SkyPixel,monospace;letter-spacing:2px;text-shadow:0 0 15px #27b7c533}.sky-refit-dialog .sky-panel-kicker{color:#55c7cf;font-size:9px}.sky-refit-dialog header .sky-hangar-button{border:1px solid #387884;background:#112936;color:#78e8e7;box-shadow:inset 0 0 0 3px #091a28}
 .sky-refit-layout{display:grid;grid-template-columns:minmax(170px,1fr) minmax(300px,2.3fr) minmax(170px,1fr);gap:22px;margin:18px 0 8px;align-items:stretch}.sky-refit-side{padding:12px 14px;border-left:1px solid #204653;border-right:1px solid #204653;background:linear-gradient(#0d25314d,#09162333)}
 .sky-refit-side h3{margin:0 0 18px;padding:9px 0;border-top:1px solid #2d7480;border-bottom:1px solid #2d7480;color:#74e6e4;font:10px monospace;letter-spacing:1.7px;text-align:center;position:relative}.sky-refit-side h3:before,.sky-refit-side h3:after{content:'';position:absolute;top:-2px;width:8px;height:3px;background:#4ce0e0}.sky-refit-side h3:before{left:0}.sky-refit-side h3:after{right:0}
 .sky-refit-tier{display:flex;align-items:center;justify-content:center;gap:12px;color:#cceef1}.sky-refit-tier strong{font:48px SkyPixel,monospace;line-height:1}.sky-refit-tier span{font:9px/1.8 monospace;letter-spacing:1px;color:#789ba9}.sky-refit-tier.target strong{color:#ffc678;text-shadow:0 0 16px #edb55533}
 .sky-refit-mini{margin:10px auto 8px;height:85px;display:grid;place-items:center;background:radial-gradient(ellipse,#257a8744,transparent 70%)}.sky-refit-mini svg{height:80px;width:100px;image-rendering:pixelated}.sky-refit-side h4{margin:0;text-align:center;color:#d4edf0;font-size:14px}.sky-refit-side p{font-size:11px;line-height:1.65;color:#83a4b1}.sky-refit-side>p{text-align:center;min-height:36px}
 .sky-refit-readout{margin-top:18px;padding-top:13px;border-top:1px solid #214b58}.sky-refit-readout>span{display:block;font:9px monospace;color:#86aeba;letter-spacing:1.5px}.sky-refit-readout>b{display:block;margin:10px 0;color:#def8fc;font:30px SkyPixel,monospace}.sky-refit-readout small{margin-left:5px;color:#39d4dc;font-size:16px}.sky-refit-segments{display:flex;gap:4px}.sky-refit-segments i{flex:1;height:7px;border:1px solid #24525c;background:#0e2430}.sky-refit-segments i.lit{border-color:#47dbdf;background:#44dbe1;box-shadow:0 0 9px #32bfc866}.sky-refit-status{display:block;margin-top:20px;color:#51c8bf;font:8px/1.8 monospace;letter-spacing:1px}.sky-refit-status:before{content:'';display:inline-block;width:5px;height:5px;background:#62efc4;box-shadow:0 0 6px #62efc4;margin-right:6px}
 .sky-refit-target-label{text-align:center;color:#779eab;font:9px monospace;letter-spacing:2px;margin:10px 0 0}.sky-refit-scanner{position:relative;aspect-ratio:1;max-width:360px;margin:0 auto}.sky-refit-radar{position:absolute;inset:0;width:100%;height:100%;filter:drop-shadow(0 0 4px #1d7c8633)}.sky-refit-aircraft{position:absolute;left:26%;top:15%;width:48%;height:70%;filter:drop-shadow(0 0 16px #23d4d555) drop-shadow(0 16px 10px #0009);image-rendering:pixelated}.sky-refit-orbit{transform-origin:220px 220px;animation:sky-refit-rotate 28s linear infinite}@keyframes sky-refit-rotate{to{transform:rotate(360deg)}}
 .sky-refit-callout{position:absolute;top:47%;font:8px/1.8 monospace;letter-spacing:.5px;color:#99bdc5;border-bottom:1px solid #35b3ba;padding-bottom:5px}.sky-refit-callout b{color:#50dadc;font-size:7px;font-weight:400}.sky-refit-callout.left{left:0}.sky-refit-callout.right{right:0;text-align:right;top:62%;border-color:#ca9a54}.sky-refit-callout.right b{color:#e8b96b}.sky-refit-center>h3{text-align:center;font:20px SkyPixel,monospace;color:#e4f9fa;margin:0 0 9px}.sky-refit-scan-caption{display:block;text-align:center;font:8px monospace;letter-spacing:1.7px;color:#4dbbbf}
 .sky-refit-feature{margin-top:23px}.sky-refit-feature>span{display:block;color:#607f91;font:8px monospace;letter-spacing:1px}.sky-refit-feature>b{display:block;color:#cce4e7;font-size:13px;margin-top:9px;line-height:1.5}.sky-refit-feature-line{height:3px;margin-top:12px;background:linear-gradient(90deg,#35c9d4 60%,#122f3a 60%);box-shadow:0 0 8px #2aa3b622}.sky-refit-readout .sky-refit-gain{color:#77dcc8;font:10px monospace;margin-bottom:0}.sky-refit-dialog .sky-refit-wallet-note{text-align:center;color:#7395a4;font:10px/1.6 monospace;margin-top:20px}
 .sky-refit-dialog .sky-hangar-dialog-actions{position:sticky;bottom:-24px;z-index:4;border-top:1px solid #235461;margin:16px -24px -24px;padding:16px 24px;background:#0a1c29f5;box-shadow:0 -10px 24px #040c1888}.sky-refit-dialog .sky-hangar-dialog-actions>span{color:#f4c580;font-size:13px}.sky-refit-dialog .sky-hangar-dialog-actions .buy{background:linear-gradient(110deg,#143c47,#14606a);border:1px solid #50e5e3;border-bottom:3px solid #249699;color:#aafffa;box-shadow:inset 0 0 20px #34dfe71a,0 0 14px #28d5da22;text-shadow:none;letter-spacing:1px;font:13px SkyPixel,monospace;min-width:210px;padding:15px 20px}
 @media(max-width:800px){.sky-refit-layout{grid-template-columns:minmax(120px,1fr) minmax(200px,1.8fr) minmax(120px,1fr);gap:8px}.sky-refit-side{padding:10px 8px}.sky-refit-callout{font-size:6px}.sky-refit-side h3{font-size:8px;letter-spacing:.5px}.sky-refit-tier strong{font-size:35px}.sky-refit-tier{gap:7px}.sky-refit-side p{font-size:10px}.sky-refit-center>h3{font-size:16px}}
 @media(max-width:580px){.sky-refit-dialog{padding:16px}.sky-refit-dialog header{top:-16px;margin:-16px -16px 14px;padding:14px 16px}.sky-refit-dialog h2{font-size:18px}.sky-refit-layout{grid-template-columns:1fr 1fr;gap:14px}.sky-refit-center{grid-column:1/-1;grid-row:1}.sky-refit-scanner{max-width:290px}.sky-refit-callout{font-size:7px}.sky-refit-side h3{font-size:9px}.sky-refit-side{padding:12px}.sky-refit-dialog .sky-hangar-dialog-actions{justify-content:center;bottom:-16px;margin-left:-16px;margin-right:-16px;margin-bottom:-16px;padding:14px 16px}.sky-refit-dialog .sky-hangar-dialog-actions .buy{width:100%}}
 @media(max-height:520px) and (min-width:801px){.sky-refit-scanner{max-width:300px}.sky-refit-mini{height:75px}.sky-refit-mini svg{height:70px}.sky-refit-layout{margin-top:10px}.sky-refit-side h3{margin-bottom:10px}.sky-refit-feature{margin-top:14px}.sky-refit-readout{margin-top:10px}.sky-refit-status{margin-top:10px}}
 @media(prefers-reduced-motion:reduce){.sky-refit-orbit{animation:none}}
 /* Scale the complete refit terminal to fit; never scroll or omit its controls. */
 .sky-refit-fit{position:relative;flex-shrink:0}
 .sky-refit-fit .sky-refit-dialog{position:absolute;left:0;top:0;transform-origin:top left;width:1180px;height:680px;max-height:none;overflow:hidden;padding:24px;display:flex;flex-direction:column}
 .sky-refit-fit .sky-refit-dialog header{position:relative;top:auto;margin:-24px -24px 8px;padding:18px 24px;min-height:52px;flex-shrink:0}
 .sky-refit-fit .sky-refit-dialog h2{font-size:23px}
 .sky-refit-fit .sky-refit-dialog .sky-panel-kicker{font-size:9px}
 .sky-refit-fit .sky-refit-layout{grid-template-columns:210px minmax(300px,1fr) 210px;gap:22px;height:424px;min-height:0;margin:12px 0 0;flex-shrink:0}
 .sky-refit-fit .sky-refit-center{grid-column:auto;grid-row:auto}
 .sky-refit-fit .sky-refit-scanner{max-width:350px}
 .sky-refit-fit .sky-refit-side{padding:12px 14px}
 .sky-refit-fit .sky-refit-side h3{font-size:10px;margin-bottom:18px;letter-spacing:1.7px}
 .sky-refit-fit .sky-refit-tier strong{font-size:48px}
 .sky-refit-fit .sky-refit-mini{height:85px}
 .sky-refit-fit .sky-refit-mini svg{height:80px}
 .sky-refit-fit .sky-refit-readout{margin-top:18px}
 .sky-refit-fit .sky-refit-feature{margin-top:23px}
 .sky-refit-fit .sky-refit-status{margin-top:20px}
 .sky-refit-fit .sky-refit-center>h3{font-size:20px}
 .sky-refit-fit .sky-refit-callout{font-size:8px}
 .sky-refit-fit .sky-refit-dialog .sky-refit-wallet-note{margin:14px 0 0;flex-shrink:0}
 .sky-refit-fit .sky-hangar-notice{margin:6px 0 0;min-height:0;font-size:12px}
 .sky-refit-fit .sky-refit-dialog .sky-hangar-dialog-actions{position:relative;bottom:auto;margin:auto -24px -24px;padding:16px 24px;flex-shrink:0;justify-content:space-between;flex-wrap:nowrap}
 .sky-refit-fit .sky-refit-dialog .sky-hangar-dialog-actions .buy{width:auto}
 .sky-hangar-station.rankings{left:30.7%;top:69.5%;width:6%;height:15.5%}
 .sky-rank-console{position:absolute;inset:3% 0 0;width:100%;height:94%;overflow:visible;filter:drop-shadow(4px 7px 3px #0008)}
 .sky-refit-fit .sky-stage-terminal header{min-height:42px;padding-top:16px;padding-bottom:16px}
 .sky-stage-grid{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));grid-template-rows:repeat(10,minmax(0,1fr));gap:10px;flex:1;min-height:0;margin:18px 0;padding:18px;border:1px solid #204e5b;background:radial-gradient(ellipse at 50% 20%,#10394b55,transparent 70%),#07162388;box-shadow:inset 0 0 28px #020b13aa}
 .sky-stage-grid .sky-hangar-button{display:flex;align-items:center;justify-content:center;gap:9px;min-height:0;padding:0;border:1px solid #275969;border-top-color:#427681;background:linear-gradient(#143441,#0b222f);box-shadow:inset 0 0 0 2px #091a25,2px 2px #020b13;color:#a1c7d0;font:17px SkyPixel,monospace;letter-spacing:1px}
 .sky-stage-grid svg{width:10px;height:13px;opacity:.7}.sky-stage-grid .sky-hangar-button:disabled{opacity:.55;filter:none;color:#5f8192;background:linear-gradient(#102532,#091925);border-color:#1b3b4b}
 .sky-stage-grid .sky-hangar-button.cleared{border-color:#369d92;color:#9be5cf}.sky-stage-grid .sky-hangar-button.selected{border:2px solid #65fff1;color:#dbfffc;background:linear-gradient(#18636d,#123c49);box-shadow:inset 0 0 0 2px #0c2935,0 0 13px #37dfe63b}
 .sky-stage-bottom{display:flex;align-items:center;gap:12px;justify-content:space-between;margin:0 -24px -24px;padding:18px 24px;border-top:1px solid #235461;background:#0a1c29f5;flex-shrink:0}
 .sky-stage-bottom .sky-hangar-button{font:14px SkyPixel,monospace;letter-spacing:1px;border:1px solid #35727c;background:linear-gradient(#153b49,#0c2635);color:#a5dade;box-shadow:inset 0 0 0 2px #091b27;min-height:46px}
 .sky-stage-bottom .sky-hangar-button.buy{background:linear-gradient(110deg,#143c47,#14606a);border:1px solid #50e5e3;border-bottom:3px solid #249699;color:#aafffa;box-shadow:inset 0 0 20px #34dfe71a,0 0 14px #28d5da22;text-shadow:none;min-width:210px}
 .sky-stage-endless.selected{outline:2px solid #61f6e9;outline-offset:2px}
 .sky-refit-fit .sky-stage-terminal{border:0;box-shadow:none;background:none;padding:30px 32px 28px;clip-path:polygon(3% 0,27.5% 0,29% 2%,71% 2%,72.5% 0,97% 0,100% 5.3%,100% 26%,99% 28.5%,99% 71.5%,100% 74%,100% 94.7%,97% 100%,72.5% 100%,71% 98%,29% 98%,27.5% 100%,3% 100%,0 94.7%,0 74%,1% 71.5%,1% 28.5%,0 26%,0 5.3%)}
 .sky-mission-armor{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;filter:drop-shadow(0 0 9px #37b8bc22)}
 .sky-stage-terminal>header,.sky-stage-terminal>.sky-stage-grid,.sky-stage-terminal>.sky-stage-bottom{position:relative;z-index:1}
 .sky-refit-fit .sky-stage-terminal header{margin:0;padding:0 4px 6px;background:none;box-shadow:none;border:0;min-height:42px}
 .sky-stage-terminal header:after{width:160px;left:4px;height:3px;background:linear-gradient(90deg,#dfad5e 0 20%,#43d6dc 20% 70%,transparent 70%);box-shadow:none}
 .sky-stage-grid{margin:6px 0;gap:6px;padding:8px;background:radial-gradient(ellipse at 50% 0,#18506444,transparent 70%),repeating-linear-gradient(0deg,transparent 0 24px,#2e799b09 24px 25px),#071623;border-color:#235465;clip-path:polygon(14px 0,calc(100% - 14px) 0,100% 14px,100% calc(100% - 14px),calc(100% - 14px) 100%,14px 100%,0 calc(100% - 14px),0 14px)}
 .sky-stage-grid .sky-hangar-button{clip-path:polygon(7px 0,100% 0,100% calc(100% - 7px),calc(100% - 7px) 100%,0 100%,0 7px)}
 .sky-stage-grid .sky-hangar-button:disabled{opacity:.8;color:#678ba0}
 .sky-stage-bottom{margin:0;padding:6px 0 0;background:none;border-color:#315463}
 .sky-stage-bottom .sky-hangar-button{clip-path:polygon(9px 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%,0 9px)}
 
 .sky-stage-terminal>header .sky-stage-endless{width:auto;height:34px;min-width:135px;white-space:nowrap;margin-left:22px;padding:8px 16px;min-height:34px;font:13px SkyPixel,monospace;border:1px solid #35727c;background:linear-gradient(#153b49,#0c2635);color:#a5dade;clip-path:polygon(7px 0,100% 0,100% calc(100% - 7px),calc(100% - 7px) 100%,0 100%,0 7px)}
 .sky-stage-terminal>header .sky-stage-endless.selected{border-color:#65fff1;color:#dbfffc;background:#18636d}
 .sky-stage-grid .sky-hangar-button{flex-direction:column;gap:3px;letter-spacing:0}
 .sky-power-icon{width:24px;height:24px;flex-shrink:0;color:#8be5e0;filter:drop-shadow(0 0 3px #51cac744)}.sky-stage-grid small{display:flex;align-items:center;justify-content:center;gap:4px}.sky-stage-grid small .sky-power-icon{width:14px;height:14px;opacity:1;color:inherit;filter:none}
 .sky-stage-grid strong{font:17px SkyPixel,monospace}.sky-stage-grid small{font:12px SkyPixel,monospace;color:#a9e5e2;white-space:nowrap}.sky-stage-grid small.challenging{color:#edc581}
 .sky-stage-bottom{justify-content:flex-end}.sky-stage-bottom .sky-hangar-button.buy{min-width:145px;min-height:34px;padding:8px 14px;font-size:12px}

 .sky-talent-terminal .sky-talent-map{position:relative;flex:1;min-height:0;margin:6px 0 12px;background:radial-gradient(ellipse at 50% 50%,#15364766,transparent 70%),repeating-linear-gradient(0deg,transparent 0 39px,#27566312 39px 40px);z-index:1}
 .sky-talent-links{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
 .sky-talent-node{position:absolute;width:76px;height:76px;transform:translate(-50%,-50%);border-radius:50%;padding:6px;border:2px solid #49606c;background:radial-gradient(circle,#103247,#081622);box-shadow:inset 0 0 0 3px #081723,0 4px 12px #000b;cursor:pointer;transition:border-color .15s,box-shadow .15s}
 .sky-talent-node svg{display:block;width:100%;height:100%;border-radius:50%;overflow:hidden}.sky-talent-node.locked svg{filter:saturate(.3) brightness(.65)}
 .sky-talent-node.installed{border-color:#70e2c3;box-shadow:inset 0 0 0 3px #123936,0 0 17px #55d9ba33}.sky-talent-node.available{border-color:#d8ae63;box-shadow:inset 0 0 0 3px #382d20,0 0 18px #e1af4c44}
 .sky-talent-node:hover,.sky-talent-node:focus-visible,.sky-talent-node.selected{outline:2px solid #f7d58d;outline-offset:5px;box-shadow:0 0 24px #d7b56b55}
 .sky-talent-node-number{position:absolute;bottom:-21px;left:50%;transform:translateX(-50%);font:11px SkyPixel,monospace;letter-spacing:2px;color:#99bbc5}.sky-talent-node-state{position:absolute;right:-2px;bottom:0;border-radius:50%;width:19px;height:19px;border:1px solid #456274;background:#071722;color:#8b9aa2;display:grid;place-items:center;font:12px monospace}
 .sky-talent-node.installed .sky-talent-node-state{color:#8affd6;border-color:#65bb9b}.sky-talent-node.available .sky-talent-node-state{color:#ffe5a3;border-color:#b59458}
 .sky-talent-inspector{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:24px;min-height:138px;flex-shrink:0;padding:16px 24px;border-top:1px solid #43626e;background:linear-gradient(110deg,#15313f88,#091925);clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px)}
 .sky-talent-description{flex:1}.sky-talent-description h3{margin:5px 0 8px;color:#f0d18b;font:20px SkyPixel,monospace}.sky-talent-description p{margin:0 0 8px;max-width:740px;font-size:14px;line-height:1.5;color:#b5d3dc}.sky-talent-description small{color:#dfbf7e;font:12px SkyPixel,monospace}.sky-talent-detail-state{font:9px monospace;letter-spacing:2px;color:#71cabc}
 .sky-talent-inspector .buy{min-width:185px;font:13px SkyPixel,monospace;align-self:center;background:linear-gradient(#e4bd73,#aa7c39);border:2px solid #e0be7d;box-shadow:inset 0 0 0 2px #654b29}
 .sky-talent-empty{width:100%;text-align:center;display:flex;flex-direction:column;gap:10px;color:#8fb5c2}.sky-talent-empty b{font:15px SkyPixel,monospace;letter-spacing:2px;color:#d4ba82}.sky-talent-empty small{font-size:12px}
 .sky-talent-save-message,.sky-talent-tree-notice{position:relative;z-index:1;flex-shrink:0;font-size:12px!important;margin:4px 0!important;line-height:1.4!important}.sky-talent-save-message{display:flex;align-items:center;gap:12px}.sky-talent-tree-notice{color:#efd198!important}
`}</style>
 {view==='hangar'?<>
 <div className="sky-hangar-scene"/>
 <header className="sky-hangar-header"><button className="sky-hangar-back" aria-label="Back to games room" onClick={onClose}><svg viewBox="0 0 24 24" width="32" height="32" shapeRendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M2 10h3V7h3V4h3v5h11v6H11v5H8v-3H5v-3H2z" /></svg></button><div className="sky-hangar-brand">SKY PATROL</div></header>
 <div className="sky-hangar-flightlevel">FLIGHT LV{level}<span className="sky-permanent-power">COMBAT POWER <b>{power.toLocaleString()}</b></span></div>
 <div className="sky-hangar-hud"><div className="sky-hangar-wallet" aria-label={`${stats.coins || 0} coins`}><PixelCoinBag/><span>{stats.coins || 0}</span></div><MoleLevelBadge stats={stats}/></div>
 {notice&&<div className="sky-hangar-reward" role="status">{notice}</div>}
 <div className="sky-hangar-world" style={scene}>
 <div className="sky-hangar-display"><div className="sky-hangar-platform"/><Aircraft level={tier} className="sky-hangar-plane"/></div>
 <button className="sky-hangar-station rankings" aria-label="leaderboard — click or tap to view rankings" title="Click or tap to view rankings" onClick={()=>setLeaderboard(true)}><span className="sky-hangar-station-label">leaderboard<small>CLICK / TAP</small></span></button>
 <button className={`sky-hangar-station launch ${arming?'arming':''}`} aria-label="start — click or tap to select a mission" title="Click or tap to choose a mission" disabled={arming} onClick={()=>setMission(true)}><span className="sky-hangar-station-label">{arming?'starting…':'start'}{!arming&&<small>CLICK / TAP</small>}</span></button>
 <button className="sky-hangar-station repair" aria-label="upgrade — click or tap to upgrade aircraft" title="Click or tap to upgrade" onClick={()=>{setNotice('');setRepair(true);}}><span className="sky-hangar-station-label">upgrade<small>CLICK / TAP</small></span></button>
 <button className="sky-hangar-station talents" aria-label="talents — click or tap to view talent board" title="Click or tap to view talents" onClick={()=>setTalents(true)}><span className="sky-hangar-station-label">talents<small>CLICK / TAP</small></span></button>
 </div>
 {talents&&<div className="sky-hangar-dialog-shade" onClick={()=>setTalents(false)}><div className="sky-refit-fit" style={{width:1180*refitScale,height:680*refitScale}}><section style={{transform:`scale(${refitScale})`}} className="sky-hangar-dialog sky-refit-dialog sky-stage-terminal sky-talent-terminal" role="dialog" aria-modal="true" aria-label="Talent board" onClick={e=>e.stopPropagation()}><MissionArmorFrame/><header><h2>TALENT TREE</h2><button className="sky-hangar-button" aria-label="Close talent board" onClick={()=>setTalents(false)}>×</button></header>{cloudStatus==='loading'&&<p className="sky-talent-save-message" role="status">Loading talents…</p>}{(cloudStatus==='error'||cloudStatus==='legacy')&&<div className="sky-talent-save-message" role="status"><span>{cloudStatus==='legacy'?'Local talents need migration review. Purchases are paused.':'Save unavailable or purchase unconfirmed. Purchases are paused.'}</span><button className="sky-hangar-button" disabled={buying} onClick={()=>setCloudRetry(v=>v+1)}>Reload save</button></div>}<AirStrikeTalentTree owned={owned} coins={stats.coins} buying={buying} purchaseReady={!skyTalentCloud||cloudStatus==='ready'} onBuy={buyTalent}/>{notice&&<p className="sky-talent-tree-notice" role="status">{notice}</p>}</section></div></div>}
 {repair&&<div className="sky-hangar-dialog-shade" onClick={()=>setRepair(false)}><div className="sky-refit-fit" style={{width:1180*refitScale,height:680*refitScale}}><section style={{transform:`scale(${refitScale})`}} className="sky-hangar-dialog sky-refit-dialog" role="dialog" aria-modal="true" aria-label="Aircraft upgrades" onClick={e=>e.stopPropagation()}><header><div><span className="sky-panel-kicker">SKY PATROL / ENGINEERING COMMAND</span><h2>AIRCRAFT REFIT</h2></div><button className="sky-hangar-button" aria-label="Close upgrade station" onClick={()=>setRepair(false)}>×</button></header>{aircraftStatus!=='ready'&&<p role="status">{aircraftStatus==='local'?'Local save mode.':aircraftStatus==='loading'?'Loading aircraft…':aircraftStatus==='legacy'?`Local tier ${aircraftLegacy} aircraft needs migration review. Purchases are paused.`:'Save unavailable or upgrade unconfirmed. Purchases are paused.'}</p>}{(aircraftStatus==='legacy'||aircraftStatus==='error')&&<button className="sky-hangar-button" disabled={buying} onClick={()=>setAircraftRetry(v=>v+1)}>Reload aircraft</button>}<RefitScanner tier={tier}/><p className="sky-refit-wallet-note">Permanent airframe upgrade · Paid with cat coins · No flight level requirement</p><p className="sky-hangar-notice" role="status">{notice||((cost??0)>stats.coins?'Not enough cat coins to upgrade.':'')}</p><div className="sky-hangar-dialog-actions"><span>{tier===10?'Maximum tier':`Upgrade cost: ${cost} coins`}</span><button className="sky-hangar-button buy" disabled={buying||tier===10||stats.coins<cost||(!!skyAircraftCloud&&aircraftStatus!=='ready')} onClick={purchase}>{buying?'Upgrading…':tier===10?'Fully upgraded':'INSTALL UPGRADE →'}</button></div></section></div></div>}
 {leaderboard&&<AirStrikeLeaderboard userId={userId} load={skyCampaignCloud?.leaderboard} onClose={()=>setLeaderboard(false)}/>} 
 {mission&&<div className="sky-hangar-dialog-shade" onClick={()=>setMission(false)}><div className="sky-refit-fit" style={{width:1180*refitScale,height:680*refitScale}}><section style={{transform:`scale(${refitScale})`}} className="sky-hangar-dialog sky-refit-dialog sky-stage-terminal" role="dialog" aria-modal="true" aria-label="Mission selection" onClick={e=>e.stopPropagation()}><MissionArmorFrame/><header><h2>STAGE SELECT</h2><button className={`sky-hangar-button sky-stage-endless ${mode==='endless'?'selected':''}`} aria-label={progress.highestCleared<100?'Endless mode, locked':'Select endless mode'} disabled={progress.highestCleared<100} onClick={()=>setMode('endless')}>∞ ENDLESS {progress.highestCleared<100&&'▣'}</button><div className="sky-stage-power" title="Readiness estimate based on permanent upgrades."><span aria-label={`Your combat power: ${power}`}><PowerIcon/><b>{power.toLocaleString()}</b></span></div><button className="sky-hangar-button" aria-label="Close mission selection" onClick={()=>setMission(false)}>×</button></header><div className="sky-stage-grid">{Array.from({length:100},(_,i)=>i+1).map(stage=><button key={stage} className={`sky-hangar-button ${stage<=progress.highestCleared?'cleared':''} ${mode==='campaign'&&stage===selectedStage?'selected':''}`} onClick={()=>{setSelectedStage(stage);setMode('campaign');}} title={`Recommended power: ${recommendedPower(stage).toLocaleString()} (guideline)`} aria-label={`Stage ${stage}, recommended power ${recommendedPower(stage)}, available`}><strong>{String(stage).padStart(3,'0')}</strong><small className={power<recommendedPower(stage)?'challenging':''}><PowerIcon/>{recommendedPower(stage).toLocaleString()}</small></button>)}</div><div className="sky-stage-bottom">{(campaignStatus==='error'||flightCloudStatus==='error')&&<button className="sky-hangar-button" aria-label="Retry loading missions" onClick={()=>setCampaignRetry(v=>v+1)}>↻</button>}<button className="sky-hangar-button buy" disabled={arming||(!!skyFlightCloud&&flightCloudStatus==='loading')||(!!skyAircraftCloud&&aircraftStatus==='loading')||(!!skyCampaignCloud&&campaignStatus==='loading')||(mode==='endless'&&progress.highestCleared<100)} onClick={launch}>START FLIGHT →</button></div></section></div></div>}
 </>:<>
 <iframe key={retry} ref={iframe} title="Sky Patrol — Airplane arcade game" src={`${ROOT}/index.html?embedded=1&launch=1&tier=${flightTier}&talents=${flightTalents.join(',')}&stage=${flight.stage}&mode=${flight.mode}&token=${encodeURIComponent(flight.token)}`} allow="autoplay; fullscreen" style={{width:'100%',height:'100%',border:0,display:'block'}}/>
 {runSummary&&<AirStrikeResults result={runSummary} viewport={refitViewport} stage={flight.stage} mode={flight.mode} pendingMessage={skyCampaignCloud&&campaignStatus!=='ready'?(campaignStatus==='error'?'Rewards pending. Reconnect to confirm.':'Confirming rewards…'):undefined} onReturn={()=>{setRunSummary(null);setView('hangar');}} onReplay={replay}/>}
 {!ready&&<div aria-label="Preparing for flight" role="status" style={{position:'absolute',inset:0,display:'grid',placeContent:'center',background:'#000',textAlign:'center',gap:16}}>{failed&&<p>Unable to load. Please retry.</p>}{failed&&<button className="sky-hangar-button" onClick={()=>{completed.current.clear();setReady(false);setFailed(false);setRetry(v=>v+1);}}>Retry</button>}{failed&&<button className="sky-hangar-button" onClick={()=>setView('hangar')}>Return to hangar</button>}</div>}
 </>}
 {arming&&view==='hangar'&&<HangarLaunchCinematic scene={scene} aircraft={<Aircraft level={flightTier} className="sky-hangar-plane"/>} onComplete={completeLaunch}/>}
 </div>;
}


