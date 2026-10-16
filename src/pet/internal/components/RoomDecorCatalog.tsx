import {useRef,useState} from 'react';
import {useGameState} from '../../runtime/SharedPetRuntime';
import {DECOR_ITEMS,decorKey,decorIconUrl,type DecorItem} from '../roomDecor.mjs';
import {CABINET_ITEMS,cabinetIconUrl,type CabinetRoom} from '../cabinets.mjs';
import {ROOM_BACKGROUNDS} from '../roomBackgrounds';
import {CabinetCatalog} from './CabinetCatalog';
import {useShopDialogue} from './ShopDialogue';

const rooms:CabinetRoom[]=['GAMES','BATHROOM','BEDROOM','KITCHEN'];
const title=(value:string)=>value[0]+value.slice(1).toLowerCase();
const button='min-h-11 border-[3px] border-[#795239] bg-[#ffd27a] px-4 py-2 font-bold focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#208b81] disabled:opacity-50';
const card='border-[3px] border-[#a17b57] bg-[#fffdf4] p-4 shadow-[4px_4px_0_#d6b88c] focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#208b81]';

export function RoomDecorCatalog({coins}:{coins:number}) {
 const {decor,hasAdoptedPet}=useGameState();
 const {say,closing}=useShopDialogue();
 const [room,setRoom]=useState<CabinetRoom|null>(null);
 const [category,setCategory]=useState<string|null>(null);
 const [message,setMessage]=useState('');
 const root=useRef<HTMLElement>(null);
 const navigate=(nextRoom:CabinetRoom|null,nextCategory:string|null)=>{
  if(closing)return;
  setRoom(nextRoom);setCategory(nextCategory);setMessage('');
  root.current?.parentElement?.scrollTo({top:0});
 };
 const items=DECOR_ITEMS.filter(item=>item.room===room);
 const categories=[...new Set(items.map(item=>item.category)),'Cabinets'];
 const disabled=decor.pending||decor.status!=='ready'||!hasAdoptedPet||closing;
 const change=async(item:DecorItem,original=false)=>{
  if(disabled)return;
  setMessage('');
  const owned=decor.state.owned.includes(item.id);
  if(!original&&!owned&&coins<item.price){say('insufficient');return;}
  const success=await(original?decor.select(decorKey(item),null):owned?decor.select(decorKey(item),item.id):decor.purchase(item.id));
  if(success===true){
   if(!original&&!owned)say('purchase');
   setMessage(original?`Original ${item.category.toLowerCase()} restored.`:owned?`${item.label} applied.`:`${item.label} purchased. Choose Use to apply it.`);
  }
 };
 return <section ref={root} aria-label="Room decor" className="text-[#583d29]">
  {!room?<div className="grid grid-cols-1 gap-5 sm:grid-cols-2">{rooms.map(value=><button key={value} className={card} onClick={()=>navigate(value,null)} aria-label={`Open ${title(value)} decor`}>
   <img src={ROOM_BACKGROUNDS[value]} alt={`${title(value)} room`} className="block w-full object-contain" style={{height:'clamp(100px,20vh,200px)',imageRendering:'pixelated'}} draggable={false}/>
   <div className="mt-3 text-xl font-black">{title(value)}</div>
  </button>)}</div>:<>
   <div className="mb-5 flex flex-wrap items-center gap-3">
    <button className={button} onClick={()=>navigate(category?room:null,null)}>{category?'← Furniture categories':'← All rooms'}</button>
    <h3 className="text-xl font-black">{title(room)}{category?` · ${category}`:''}</h3>
   </div>
   {!category?<div aria-label={`${title(room)} furniture categories`} className="grid grid-cols-1 gap-5 sm:grid-cols-2">{categories.map(value=>{
    const item=items.find(item=>item.category===value);
    const cabinet=CABINET_ITEMS.find(item=>item.room===room)!;
    return <button key={value} className={card} onClick={()=>navigate(room,value)} aria-label={`Browse ${title(room)} ${value}`}>
     <div className="flex h-40 items-center justify-center bg-[#f6eccb] p-3"><img src={item?decorIconUrl(item.id):cabinetIconUrl(cabinet.id)} alt="" className="h-full w-full object-contain" style={{imageRendering:'pixelated'}} draggable={false}/></div>
     <div className="mt-3 text-xl font-black">{value}</div>
    </button>;
   })}</div>:category==='Cabinets'?<CabinetCatalog coins={coins} room={room}/>:<>
    {decor.status==='loading'&&<p role="status">Loading your room styles...</p>}
    {decor.error&&<div role="alert" className="mb-4">{decor.error} <button className={button} disabled={decor.pending||closing} onClick={()=>void decor.reload()}>Retry</button></div>}
    <p role="status" aria-live="polite" className="mb-3 font-bold">{message}</p>
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">{items.filter(item=>item.category===category).map(item=>{
     const owned=decor.state.owned.includes(item.id),active=decor.state.selected[decorKey(item)]===item.id;
     return <article key={item.id} aria-label={item.label} className={card}>
      <div className="flex h-44 items-center justify-center bg-[#f6eccb] p-3"><img src={decorIconUrl(item.id)} alt={item.label} className="h-full w-full object-contain" style={{imageRendering:'pixelated'}}/></div>
      <h4 className="mt-3 text-lg font-black">{item.label}</h4><p className="my-2">{active?'✓ Using':owned?'Owned':`${item.price.toLocaleString('en-US')} coins`}</p>
      <div className="flex flex-wrap gap-2"><button className={button} style={!owned&&coins<item.price?{opacity:.5}:undefined} disabled={disabled||active} onClick={()=>void change(item)}>{decor.pending?'Saving…':active?'Using':owned?'Use':`Buy · ${item.price.toLocaleString('en-US')}`}</button>
      {active&&<button className={button} disabled={disabled} onClick={()=>void change(item,true)}>Use original</button>}</div>
      {!owned&&coins<item.price&&<p className="mt-2 text-sm">Not enough coins</p>}
     </article>;
    })}</div>
   </>}
  </>}
 </section>;
}
