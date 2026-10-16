export const CABINET_ITEMS = [
  { id:'cabinet_games_blue', room:'GAMES', area:'Games', label:'Cloud Blue Cabinet', price:2200, color:'#7fabc0', source:'game' },
  { id:'cabinet_bathroom_teal', room:'BATHROOM', area:'Bathroom', label:'Seafoam Cabinet', price:1800, color:'#69a69a', source:'bathroom' },
  { id:'cabinet_bedroom_lavender', room:'BEDROOM', area:'Bedroom', label:'Lavender Wardrobe', price:2600, color:'#a18bb8', source:'bedroom' },
  { id:'cabinet_kitchen_sage', room:'KITCHEN', area:'Kitchen', label:'Sage Kitchen Cabinets', price:2800, color:'#8ea67b', source:'kitchen' },
];
export const CABINET_BY_ID = Object.fromEntries(CABINET_ITEMS.map(item=>[item.id,item]));
export const emptyCabinets = () => ({owned:[], selected:{}});
const isRecord = value => value !== null && typeof value === 'object'
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
export function validateCabinets(value) {
  if (!isRecord(value) || !Array.isArray(value.owned) || !isRecord(value.selected)) throw Error('Invalid cabinet save');
  if(new Set(value.owned).size!==value.owned.length) throw Error('Invalid cabinet ownership');
  // Iterate sparse arrays too; property-key coercion must not accept arrays or boxed strings as IDs.
  for(const id of value.owned) if(typeof id !== 'string' || !Object.hasOwn(CABINET_BY_ID,id)) throw Error('Invalid cabinet ownership');
  const selected={};
  for(const [room,id] of Object.entries(value.selected)) {
    if(typeof id !== 'string'||!value.owned.includes(id)||CABINET_BY_ID[id]?.room!==room) throw Error('Invalid selected cabinet');
    selected[room]=id;
  }
  return {owned:[...value.owned],selected};
}
export function selectCabinet(state,room,id) {
  const next=validateCabinets(state);
  if(!CABINET_ITEMS.some(item=>item.room===room))throw Error('Invalid cabinet room');
  if(id===null)delete next.selected[room];
  else {if(!next.owned.includes(id)||CABINET_BY_ID[id]?.room!==room)throw Error('Buy this cabinet first');next.selected[room]=id;}
  return next;
}
export const cabinetRoomUrl=id=>`/pet-function/cabinets/${id}.webp?v=2`;
export const cabinetIconUrl=id=>`/pet-function/cabinets/${id}-icon.png?v=2`;
