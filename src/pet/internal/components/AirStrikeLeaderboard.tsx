import {useEffect,useRef,useState} from 'react';
import type {EndlessRank} from '../../../apps/repositories/airStrikeCampaignCloud.mjs';

export function AirStrikeLeaderboard({load,onClose,userId}:{load?:()=>Promise<EndlessRank[]>;onClose:()=>void;userId?:string|null}){
 const service=useRef(load);service.current=load;
 const [rows,setRows]=useState<EndlessRank[]>([]),[state,setState]=useState<'loading'|'ready'|'error'|'local'>('loading'),[retry,setRetry]=useState(0),[updated,setUpdated]=useState('');
 useEffect(()=>{
  let stopped=false,busy=false;
  setRows([]);setUpdated('');
  const refresh=async()=>{
   if(!service.current){setState('local');return;}
   if(busy)return;busy=true;
   try{const result=await service.current();if(!stopped){setRows(result);setState('ready');setUpdated(new Date().toLocaleTimeString());}}
   catch{if(!stopped)setState('error');}finally{busy=false;}
  };
  setState('loading');void refresh();const timer=setInterval(refresh,15000);
  window.addEventListener('focus',refresh);
  return()=>{stopped=true;clearInterval(timer);window.removeEventListener('focus',refresh);};
 },[userId,!!load,retry]);
 useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[onClose]);
 return <div className="sky-hangar-dialog-shade" onClick={onClose}>
  <style>{`.sky-rank-row{display:grid;grid-template-columns:44px 42px minmax(0,1fr) 100px;gap:12px;align-items:center;padding:12px 10px;border-bottom:1px solid #71877d55}.sky-rank-row.mine{background:#72613e55;border-left:3px solid #f4d493}.sky-rank-avatar{width:40px;height:40px;border-radius:50%;background:#324c53;display:grid;place-items:center;overflow:hidden;color:#ffe1a1;position:relative}.sky-rank-avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.sky-rank-name{overflow-wrap:anywhere}.sky-rank-wave{text-align:right;color:#f4d493}.sky-rank-note{font-size:12px;color:#b6cbc7}@media(max-width:500px){.sky-rank-row{gap:6px;grid-template-columns:30px 36px minmax(0,1fr) 82px}.sky-rank-avatar{width:34px;height:34px}}`}</style>
  <section className="sky-hangar-dialog" role="dialog" aria-modal="true" aria-label="Endless leaderboard" onClick={e=>e.stopPropagation()}>
   <header><h2>ENDLESS · LEADERBOARD</h2><button className="sky-hangar-button" onClick={onClose} aria-label="Close leaderboard">×</button></header>
   <p className="sky-rank-note">Highest wave reached · Top 50 and your rank · Earlier achievements win ties</p>
   <p role="status">{state==='local'?'Sign in to view the leaderboard.':state==='loading'?'Loading leaderboard…':state==='error'?'Leaderboard unavailable. Check your connection and try again.':rows.length?'Reach higher waves and outfly other pilots.':'No scores yet. Be the first pilot on the board.'}</p>
   {rows.map(row=><div key={row.userId} className={`sky-rank-row ${row.isYou?'mine':''}`}>
    <strong>#{row.rank}</strong><span className="sky-rank-avatar">{row.name.slice(0,1)}{row.avatarUrl?<img src={row.avatarUrl} alt={`${row.name}'s avatar`} referrerPolicy="no-referrer" onError={e=>{e.currentTarget.style.display='none';}}/>:null}</span>
    <span className="sky-rank-name">{row.name}{row.isYou&&<small> · YOU</small>}</span><strong className="sky-rank-wave">WAVE {row.wave}</strong>
   </div>)}
   {state!=='local'&&<footer><button className="sky-hangar-button" onClick={()=>setRetry(v=>v+1)}>Refresh leaderboard</button><p className="sky-rank-note">Refreshes every 15 seconds{updated?` · Updated ${updated}`:''}</p></footer>}
  </section>
 </div>;
}
