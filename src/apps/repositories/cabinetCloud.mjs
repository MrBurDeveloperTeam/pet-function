import {validateCabinets,CABINET_BY_ID,CABINET_ITEMS} from '../../pet/internal/cabinets.mjs';
export function createCabinetCloud(client) {
  const call=async(userId,name,args)=>{if(!userId)throw Error('Sign in to customize cabinets');const{data,error}=await client.rpc(name,args);if(error)throw error;return data;};
  return {
    async loadCabinets(userId){return validateCabinets(await call(userId,'pet_cabinets_get'));},
    async purchaseCabinetItem(userId,id){
      if(!Object.hasOwn(CABINET_BY_ID,id))throw Error('Unknown cabinet');
      const receipt=await call(userId,'pet_cabinets_purchase',{p_item_id:id});
      const cabinets=validateCabinets(receipt?.cabinets);
      if(!cabinets.owned.includes(id)||!Number.isSafeInteger(receipt?.coins)||receipt.coins<0)throw Error('Invalid cabinet receipt');
      return{cabinets,coins:receipt.coins};
    },
    async selectCabinetItem(userId,room,id){
      if(!CABINET_ITEMS.some(item=>item.room===room)||(id!==null&&CABINET_BY_ID[id]?.room!==room))throw Error('Invalid cabinet');
      const cabinets=validateCabinets(await call(userId,'pet_cabinets_select',{p_room:room,p_item_id:id}));
      if((cabinets.selected[room]??null)!==id)throw Error('Cabinet selection was not saved');
      return cabinets;
    },
  };
}
