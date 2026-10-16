import {useState} from 'react';
import {useGameState} from '../../runtime/SharedPetRuntime';
import {CABINET_ITEMS,cabinetIconUrl,type CabinetRoom} from '../cabinets.mjs';

export function CabinetCatalog({coins,room}:{coins:number;room:CabinetRoom}) {
 const {cabinets}=useGameState();
 const [message,setMessage]=useState('');
 const button='min-h-11 border-[3px] border-[#795239] bg-[#ffd27a] px-4 py-2 font-bold focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#208b81] disabled:opacity-50';
 const items=CABINET_ITEMS.filter(item=>item.room===room);
 const change=async(item:typeof CABINET_ITEMS[number],original=false)=>{
  setMessage('');
  const owned=cabinets.state.owned.includes(item.id);
  const success=await(original?cabinets.select(item.room,null):owned?cabinets.select(item.room,item.id):cabinets.purchase(item.id));
  if(success)setMessage(original?'Original cabinet restored.':owned?`${item.label} applied.`:`${item.label} purchased. Choose Use to apply it.`);
 };
 return <div className="text-[#583d29]">
  {cabinets.status==='loading'&&<p role="status" className="mb-4 font-bold">Loading your cabinet styles...</p>}
  {cabinets.error&&<div role="alert" className="mb-4">{cabinets.error} <button className={button} onClick={()=>void cabinets.reload()}>Retry</button></div>}
  <p role="status" aria-live="polite" className="mb-3 font-bold">{message}</p>
  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
   {items.map(item=>{
    const owned=cabinets.state.owned.includes(item.id),active=cabinets.state.selected[item.room]===item.id;
    const disabled=cabinets.pending||cabinets.status!=='ready';
    return <article key={item.id} aria-label={item.label} className="border-[3px] border-[#a17b57] bg-[#fffdf4] p-4 shadow-[4px_4px_0_#d6b88c]">
     <div className="flex h-44 items-center justify-center bg-[#f6eccb] p-3"><img src={cabinetIconUrl(item.id)} alt={item.label} className="h-full w-full object-contain" style={{imageRendering:'pixelated'}} draggable={false}/></div>
     <h4 className="mt-3 text-lg font-black">{item.label}</h4><p className="my-2">{active?'✓ Using':owned?'Owned':`${item.price.toLocaleString('en-US')} coins`}</p>
     <div className="flex flex-wrap gap-2">
      <button className={button} disabled={disabled||(!owned&&coins<item.price)||active} onClick={()=>void change(item)}>{cabinets.pending?'Saving…':active?'Using':owned?'Use':`Buy · ${item.price.toLocaleString('en-US')}`}</button>
      {active&&<button className={button} disabled={disabled} onClick={()=>void change(item,true)}>Use original</button>}
     </div>
     {!owned&&coins<item.price&&<p className="mt-2 text-sm">Not enough coins</p>}
    </article>;
   })}
  </div>
 </div>;
}
