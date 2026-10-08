import test from 'node:test';
import assert from 'node:assert/strict';
import {createAirStrikeTalentCloud} from '../src/apps/repositories/airStrikeTalentCloud.mjs';
import {reconcileTalentCloud} from '../src/pet/internal/components/airStrikeTalents.mjs';
test('authenticated cloud reads and purchases use server ownership and a single atomic RPC',async()=>{
 const calls=[];
 const client={rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='air_strike_talents_get'?[1,2]:[{out_talents:[1,2,3],out_coins:500}],error:null};}};
 const store=createAirStrikeTalentCloud(client);
 assert.deepEqual(await store.loadAirStrikeTalents('owner'),[1,2]);
 assert.deepEqual(await store.purchaseAirStrikeTalent('owner',3),{talents:[1,2,3],coins:500});
 assert.deepEqual(calls,[['air_strike_talents_get',undefined],['air_strike_talent_purchase',{p_talent_id:3}]]);
});
test('RPC errors and lost receipts never trigger a second local wallet charge',async()=>{
 let calls=0;
 const store=createAirStrikeTalentCloud({rpc:async()=>{calls++;return {data:null,error:Error('network response lost')};}});
 await assert.rejects(store.purchaseAirStrikeTalent('owner',1),/network response lost/);
 assert.equal(calls,1);
 await assert.rejects(store.purchaseAirStrikeTalent('owner',16),/Invalid/);
 await assert.rejects(store.purchaseAirStrikeTalent('',1),/Invalid/);
 assert.equal(calls,1);
});
test('malformed server receipts do not grant unconfirmed talents or coin values',async()=>{
 for(const data of [null,{out_talents:[1],out_coins:-1},{out_talents:[2],out_coins:300},{out_talents:[1,1],out_coins:300},{out_talents:[1,16],out_coins:300},{out_talents:[1],out_coins:'300'}]){
  const store=createAirStrikeTalentCloud({rpc:async()=>({data,error:null})});
  await assert.rejects(store.purchaseAirStrikeTalent('owner',1));
 }
});
test('old local purchases remain reviewable without auto-granting or losing backups',()=>{
 assert.deepEqual(reconcileTalentCloud([1,2,3],[1]),{talents:[1],legacy:[2,3]});
 assert.deepEqual(reconcileTalentCloud([1,2,3],[1,2,3,4]),{talents:[1,2,3,4],legacy:[]});
 assert.deepEqual(reconcileTalentCloud([],[1,2]),{talents:[1,2],legacy:[]});
});
