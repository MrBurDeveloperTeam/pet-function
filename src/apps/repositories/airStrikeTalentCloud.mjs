import {normalizeTalents} from '../../pet/internal/components/airStrikeTalents.mjs';
function validTalents(value){
 if(!Array.isArray(value)||value.length>15||value.some(id=>!Number.isInteger(id)||id<1||id>15)||new Set(value).size!==value.length)throw Error('Invalid cloud talent ownership');
 return normalizeTalents(value);
}
export function createAirStrikeTalentCloud(client){
 return {
  async loadAirStrikeTalents(userId){
   if(!userId)throw Error('Authentication required');
   const {data,error}=await client.rpc('air_strike_talents_get');
   if(error)throw error;
   return validTalents(data);
  },
  async purchaseAirStrikeTalent(userId,talentId){
   if(!userId||!Number.isInteger(talentId)||talentId<1||talentId>15)throw Error('Invalid talent purchase');
   const {data,error}=await client.rpc('air_strike_talent_purchase',{p_talent_id:talentId});
   if(error)throw error;
   const row=Array.isArray(data)?data[0]:data;
   const talents=validTalents(row?.out_talents);
   if(!talents.includes(talentId)||!Number.isSafeInteger(row?.out_coins)||row.out_coins<0)throw Error('Invalid cloud purchase receipt');
   return {talents,coins:row.out_coins};
  }
 };
}
