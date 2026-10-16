import React, {useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SharedCatMascot} from '../../src/cat/SharedCatMascot';
import {useMeowDialogue} from '../../src/cat/useMeowDialogue';
import '../../dist/styles.css';
const rows = new Map([['alice', [{id:'demo',state:'Normal',text:'One little break, then we can finish this together! 🐾'}]], ['bob', []]]);
const copy = (v:any)=>JSON.parse(JSON.stringify(v));
function Fixture(){
 const [owner,setOwner]=useState<string|null>('alice'),[active,setActive]=useState(true),[blocked,setBlocked]=useState(false),[mood,setMood]=useState('Normal');
 const [fail,setFail]=useState(false),[slow,setSlow]=useState(false),[visits,setVisits]=useState(0),[event,setEvent]=useState('');
 const control=useRef({fail,slow});control.current={fail,slow};const failSave=useRef(false);
 const repo=useMemo(()=>({
  async pause(){await new Promise(r=>setTimeout(r,control.current.slow?2200:180));if(control.current.fail)throw Error('Simulated network failure');},
  async load(id:string){await this.pause();return {presets:copy(rows.get(id)??[]),timing:{[mood]:{intervalMs:900,durationMs:1100,disabled:false}}};},
  async add(id:string,state:string,text:string){await this.pause();if(failSave.current){failSave.current=false;throw Error('Simulated save failure');}const item={id:crypto.randomUUID(),state,text};rows.set(id,[...(rows.get(id)??[]),item]);return item;},
  async update(id:string,key:string,text:string,expected?:string){await this.pause();const list=rows.get(id)??[];const item=list.find(x=>x.id===key);if(!item||expected&&item.text!==expected)throw Error('Conflict');const next={...item,text};rows.set(id,list.map(x=>x.id===key?next:x));return next;},
  async remove(id:string,key:string){await this.pause();rows.set(id,(rows.get(id)??[]).filter(x=>x.id!==key));}
 }),[mood]);
 const {message,controller}=useMeowDialogue({repository:repo,ownerId:owner,active,blocked,states:[mood]});
 return <><style>{`body{margin:0;background:#f4f9fb;color:#0f172a;font:16px system-ui}main{max-width:1100px;margin:auto;padding:40px 24px}h1{font-size:46px;font-weight:750;letter-spacing:-2px}h1 span{color:#70beba}p{color:#536b7a;line-height:1.6}.test-controls{display:flex;flex-wrap:wrap;gap:10px;max-width:850px}.test-controls button{min-height:44px;background:white;border:1px solid #cddede;border-radius:9px;padding:8px 16px;cursor:pointer}.test-controls button[aria-pressed=true]{background:#dff4ee}.status{display:block;margin-top:16px;font-size:14px}footer{margin-top:50px;border-top:1px solid #dbe5ea;padding-top:20px;color:#657789}`}</style><main><h1>App. <span>Snabbb.</span></h1><p>Personal cat sayings · isolated preview</p><p>Your companion keeps its usual words, with a few of your own.</p><div className="test-controls">
 <button onClick={()=>setOwner(owner==='alice'?'bob':'alice')}>Switch account</button>
 <button onClick={()=>setOwner(owner?null:'alice')}>{owner?'Sign out':'Sign in'}</button>
 <button onClick={()=>setFail(!fail)} aria-pressed={fail}>Network failure</button>
 <button onClick={()=>{failSave.current=true;setEvent('Next save will fail once');}}>Fail next save</button>
 <button onClick={()=>{setEvent('Saved row will disappear shortly');setTimeout(()=>{if(owner)rows.set(owner,(rows.get(owner)??[]).slice(1));void controller.reload();setEvent('Saved row removed elsewhere');},2600);}}>Remove first saying in 3 seconds</button>
 <button onClick={()=>setSlow(!slow)} aria-pressed={slow}>Slow network</button>
 <button onClick={()=>setActive(!active)} aria-pressed={!active}>Pause cat</button>
 <button onClick={()=>setBlocked(!blocked)} aria-pressed={blocked}>Business reminder</button>
 <button onClick={()=>{setEvent('Account will switch shortly');setTimeout(()=>{setOwner('bob');setEvent('Account switched');},1800);}}>Switch account in 2 seconds</button>
 <button onClick={()=>{setFail(true);setEvent('Network failure armed');setTimeout(()=>{setFail(false);setEvent('Network restored');},9000);}}>Fail next 9 seconds</button>
 {['Normal','Hungry','Unhappy','Dirty','Low Energy'].map(state=><button key={state} aria-pressed={mood===state} onClick={()=>setMood(state)}>{state}</button>)}
 </div><output className="status">Account: {owner??'signed out'} · {controller.status} · {controller.pending?'saving':'idle'} · {visits} room visits</output><p role="status">{event}</p><footer>This preview uses only memory. It does not contact Supabase or save real account data.</footer></main>
 <SharedCatMascot petId="silverbelt" disabled={!active} meowMessage={message} dialoguePresets={controller} onCatClick={()=>setVisits(x=>x+1)} dialogue={blocked?{kind:'personalized',message:'A business reminder keeps priority.',onClose:()=>setBlocked(false)}:{kind:'none'}}/>
 </>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
