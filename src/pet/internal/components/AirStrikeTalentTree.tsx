import {useState} from 'react';
import {TALENTS,talentRequirement} from './airStrikeTalents.mjs';

const CELLS=[1,0,3,0,0,10,19,2,13,16,13,16,17,8,12];
const POINTS=Array.from({length:15},(_,i)=>({x:100+Math.floor(i/3)*220,y:Math.floor(i/3)%2===0?85+(i%3)*105:295-(i%3)*105}));

export function AirStrikeTalentTree({owned,coins,buying,purchaseReady,onBuy}:{owned:number[];coins:number;buying:boolean;purchaseReady:boolean;onBuy:(id:number)=>void}){
 const [selected,setSelected]=useState<number|null>(null);
 const talent=TALENTS.find(t=>t.id===selected),unlocked=!!talent&&owned.includes(talent.id),requirement=talent?talentRequirement(talent.id,owned):'';
 return <>
  <div className="sky-talent-map" aria-label="Permanent talent tree">
   <svg className="sky-talent-links" viewBox="0 0 1100 380" preserveAspectRatio="none" aria-hidden="true">
    {[100,320,540,760,980].map((x,i)=><g key={x}><circle cx={x} cy="190" r="145" fill="none" stroke="#244653" strokeDasharray="2 9"/><circle cx={x} cy="190" r="111" fill="none" stroke="#173947"/><path d={`M${x-80} 190h160`} stroke="#22444e"/></g>)}
    {POINTS.slice(1).map((p,i)=>{const previous=POINTS[i];return <path key={i} d={`M${previous.x} ${previous.y}L${p.x} ${p.y}`} fill="none" stroke={owned.includes(i+2)?'#70e2c3':owned.includes(i+1)?'#d8ae63':'#36505b'} strokeWidth={owned.includes(i+2)?4:2} strokeDasharray={owned.includes(i+1)?undefined:'5 7'}/>;})}
   </svg>
   {TALENTS.map((t,i)=>{const p=POINTS[i],installed=owned.includes(t.id),locked=!!talentRequirement(t.id,owned),cell=CELLS[i];return <button key={t.id} type="button" className={`sky-talent-node ${installed?'installed':locked?'locked':'available'} ${selected===t.id?'selected':''}`} style={{left:`${p.x/11}%`,top:`${p.y/3.8}%`}} aria-label={`${t.name}, ${installed?'unlocked':locked?'locked':'available'}`} aria-pressed={selected===t.id} onClick={()=>setSelected(t.id)}>
    <svg viewBox={`${(cell%6)*256} ${Math.floor(cell/6)*256} 256 256`} aria-hidden="true"><image href="/games/air-strike/skill-atlas.png" width="1536" height="1024"/></svg>
    <span className="sky-talent-node-number">{String(t.id).padStart(2,'0')}</span>
    <span className="sky-talent-node-state" aria-hidden="true">{installed?'✓':locked?'▣':'+'}</span>
   </button>;})}
  </div>
  <div className="sky-talent-inspector" aria-live="polite">
   {talent?<><div className="sky-talent-description"><span className="sky-talent-detail-state">{unlocked?'INSTALLED':requirement?'LOCKED':'AVAILABLE'}</span><h3>{talent.name}</h3><p>{talent.description}</p><small>{requirement||`${talent.cost.toLocaleString()} coins`}</small></div><button className="sky-hangar-button buy" disabled={buying||unlocked||!!requirement||coins<talent.cost||!purchaseReady} onClick={()=>onBuy(talent.id)}>{unlocked?'Unlocked':buying?'Processing…':coins<talent.cost?'Not enough coins':`Unlock · ${talent.cost.toLocaleString()}`}</button></>:<span className="sky-talent-empty"><b>SELECT A TALENT</b><small>Click an icon to view its upgrade.</small></span>}
  </div>
 </>;
}
