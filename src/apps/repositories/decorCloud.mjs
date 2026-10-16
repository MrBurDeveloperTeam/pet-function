import {validateDecor,DECOR_BY_ID,DECOR_ITEMS,decorKey} from '../../pet/internal/roomDecor.mjs';
export function createDecorCloud(client){
 const call=async(userId,name,args)=>{if(!userId)throw Error('Sign in to customize rooms');const{data,error}=await client.rpc(name,args);if(error)throw error;return data;};
 return {
 async loadDecor(userId){return validateDecor(await call(userId,'pet_decor_get'));},
 async purchaseDecorItem(userId,id){if(!Object.hasOwn(DECOR_BY_ID,id))throw Error('Unknown decor');const receipt=await call(userId,'pet_decor_purchase',{p_item_id:id});const decor=validateDecor(receipt?.decor);if(!decor.owned.includes(id)||!Number.isSafeInteger(receipt?.coins)||receipt.coins<0)throw Error('Invalid decor receipt');return{decor,coins:receipt.coins};},
 async selectDecorItem(userId,slot,id){if(!DECOR_ITEMS.some(i=>decorKey(i)===slot)||(id!==null&&(!Object.hasOwn(DECOR_BY_ID,id)||decorKey(DECOR_BY_ID[id])!==slot)))throw Error('Invalid decor slot');const state=validateDecor(await call(userId,'pet_decor_select',{p_slot:slot,p_item_id:id}));if((state.selected[slot]??null)!==id)throw Error('Selection not saved');return state;}
 };}
